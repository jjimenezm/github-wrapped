#!/usr/bin/env bash
# Deploys one image tag to Dokploy applications in the order given. Each one has to be running and
# healthy on the new image before the next one starts.
#
#   dokploy-deploy.sh api renderer web
#
# Required: DOKPLOY_URL (the panel, https://...), DOKPLOY_API_KEY, IMAGE_PREFIX (ghcr.io/owner/repo),
#           IMAGE_TAG, and DOKPLOY_APP_ID_<SERVICE> for each service (DOKPLOY_APP_ID_API, ...).
# Optional: DEPLOY_NOTE (the deployment's description in Dokploy), DEPLOY_TIMEOUT (seconds per
#           service, default 600), POLL_INTERVAL (seconds, default 5), and CF_ACCESS_CLIENT_ID /
#           CF_ACCESS_CLIENT_SECRET when the panel sits behind Cloudflare Access.
#
# For each service:
# 1. Point the application at <IMAGE_PREFIX>-<service>:<IMAGE_TAG> (application.update, which
#    leaves the registry credentials alone).
# 2. Deploy it and wait for Dokploy's deployment to finish: the image is pulled and the Swarm
#    service updated.
# 3. Wait for Swarm's rolling update. Dokploy updates start-first with automatic rollback, and a
#    task only counts as running once its HEALTHCHECK passes. So "completed" means the new version
#    is healthy, and "rollback_*" means it never got there and the previous one is still serving.
#
# If a service fails, its application is pointed back at its previous image (without deploying), so
# Dokploy's settings match what is running, and the services after it are left alone.
set -euo pipefail

log() { printf '%s\n' "$*" >&2; }
summary() { [[ -z ${GITHUB_STEP_SUMMARY:-} ]] || printf '%s\n' "$@" >>"$GITHUB_STEP_SUMMARY"; }
fail() {
  printf '::error::%s\n' "$*" >&2
  summary "" "**Failed:** $*"
  exit 1
}

for name in DOKPLOY_URL DOKPLOY_API_KEY IMAGE_PREFIX IMAGE_TAG; do
  [[ -n ${!name:-} ]] || fail "$name is not set"
done
[[ $IMAGE_TAG =~ ^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$ ]] || fail "Invalid image tag: $IMAGE_TAG"
(($# > 0)) || fail 'Usage: dokploy-deploy.sh <service>...'

timeout=${DEPLOY_TIMEOUT:-600}
interval=${POLL_INTERVAL:-5}
api="${DOKPLOY_URL%/}/api"

# The credentials reach curl through a private config file, never through its command line.
curl_config=$(mktemp)
response=$(mktemp)
chmod 600 "$curl_config"

# Set while a service runs on a new image that isn't confirmed healthy yet.
restore_app_id=''
restore_image=''
cleanup() {
  local status=$?
  if ((status != 0)) && [[ -n $restore_app_id ]]; then
    log "Pointing the application back at $restore_image (no redeploy)."
    (dokploy POST application.update "$(update_body "$restore_app_id" "$restore_image")" >/dev/null) ||
      log "Couldn't restore it: set the image back by hand in Dokploy."
  fi
  rm -f "$curl_config" "$response"
}
trap cleanup EXIT
{
  printf 'header = "x-api-key: %s"\n' "$DOKPLOY_API_KEY"
  if [[ -n ${CF_ACCESS_CLIENT_ID:-} ]]; then
    printf 'header = "CF-Access-Client-Id: %s"\n' "$CF_ACCESS_CLIENT_ID"
    printf 'header = "CF-Access-Client-Secret: %s"\n' "${CF_ACCESS_CLIENT_SECRET:?CF_ACCESS_CLIENT_SECRET is not set}"
  fi
} >"$curl_config"

# dokploy GET <procedure> [name=value]...   prints the JSON answer
# dokploy POST <procedure> <json>           prints the JSON answer
dokploy() {
  local method=$1 procedure=$2 code pair hint=''
  shift 2
  local args=(--silent --show-error --config "$curl_config" --user-agent github-wrapped-deploy
    --output "$response" --write-out '%{http_code}')
  if [[ $method == GET ]]; then
    # Reads are safe to repeat when the network hiccups.
    args+=(--get --max-time 30 --retry 3 --retry-all-errors --retry-delay 2)
    for pair in "$@"; do args+=(--data-urlencode "$pair"); done
  else
    # Writes go once: a retried deploy would queue a second one.
    args+=(--max-time 60 --header 'content-type: application/json' --data "$1")
  fi
  code=$(curl "${args[@]}" "$api/$procedure") || fail "Dokploy $procedure: no answer from the panel."
  if [[ $code != 2?? ]]; then
    case $code in
      401) hint=' The API key is wrong, expired or deleted.' ;;
      403) hint=' Cloudflare may be blocking the runner (Bot Fight Mode, a WAF rule or Access).' ;;
      404) hint=' Check DOKPLOY_URL and the application ids.' ;;
    esac
    fail "Dokploy $procedure answered HTTP $code.$hint $(head -c 300 "$response" | tr '\n' ' ')"
  fi
  cat "$response"
}

update_body() { jq -nc --arg id "$1" --arg image "$2" '{applicationId: $id, dockerImage: $image}'; }

# Waits until Dokploy records a deployment newer than <previous> and it ends.
wait_for_deployment() {
  local service=$1 app_id=$2 previous=$3 deadline=$((SECONDS + timeout)) latest id status
  while true; do
    latest=$(dokploy GET deployment.all "applicationId=$app_id" | jq -c '.[0] // {}')
    id=$(jq -r '.deploymentId // ""' <<<"$latest")
    status=$(jq -r '.status // ""' <<<"$latest")
    if [[ -n $id && $id != "$previous" ]]; then
      case $status in
        done) return 0 ;;
        error | cancelled)
          fail "$service: the Dokploy deployment ended as '$status'. Its log is in the application's Deployments tab."
          ;;
      esac
    fi
    ((SECONDS < deadline)) || fail "$service: the Dokploy deployment did not finish within ${timeout}s."
    sleep "$interval"
  done
}

# Waits until the Swarm service, past spec version <before>, finishes its rolling update on <image>.
wait_for_rollout() {
  local service=$1 app_name=$2 image=$3 before=$4 deadline=$((SECONDS + timeout))
  local spec version state message current
  while true; do
    spec=$(dokploy GET docker.getConfig "containerId=$app_name")
    version=$(jq -r '.Version.Index // 0' <<<"${spec:-null}")
    state=$(jq -r '.UpdateStatus.State // ""' <<<"${spec:-null}")
    message=$(jq -r '.UpdateStatus.Message // ""' <<<"${spec:-null}")
    current=$(jq -r '.Spec.TaskTemplate.ContainerSpec.Image // ""' <<<"${spec:-null}")
    if ((version > before)); then
      case $state in
        completed)
          if [[ $current == "$image" || $current == "$image@"* ]]; then return 0; fi
          ;;
        rollback_started | rollback_paused | rollback_completed | paused)
          fail "$service: Swarm update $state (${message:-no message}). The previous version is still serving; the task logs are in Dokploy."
          ;;
      esac
    fi
    ((SECONDS < deadline)) ||
      fail "$service: no healthy task on $IMAGE_TAG within ${timeout}s (Swarm update state: ${state:-none})."
    sleep "$interval"
  done
}

deploy_service() {
  local service=$1 var app_id image app app_name source current previous before
  var="DOKPLOY_APP_ID_$(tr '[:lower:]-' '[:upper:]_' <<<"$service")"
  app_id=${!var:-}
  [[ -n $app_id ]] || fail "$var is not set"
  image="$IMAGE_PREFIX-$service:$IMAGE_TAG"

  app=$(dokploy GET application.one "applicationId=$app_id")
  app_name=$(jq -r '.appName // ""' <<<"$app")
  source=$(jq -r '.sourceType // ""' <<<"$app")
  current=$(jq -r '.dockerImage // ""' <<<"$app")
  [[ -n $app_name ]] || fail "$service: $var doesn't match a Dokploy application."
  [[ $source == docker ]] || fail "$service: the Dokploy application deploys from '$source', not from a Docker image."
  # The app name is an internal hostname; it has no place in a public log.
  echo "::add-mask::$app_name"

  previous=$(dokploy GET deployment.all "applicationId=$app_id" | jq -r '.[0].deploymentId // ""')
  before=$(dokploy GET docker.getConfig "containerId=$app_name" | jq -r '.Version.Index // 0')

  log "$service: ${current:-(no image)} -> $image"
  dokploy POST application.update "$(update_body "$app_id" "$image")" >/dev/null
  if [[ -n $current && $current != "$image" ]]; then
    restore_app_id=$app_id
    restore_image=$current
  fi
  dokploy POST application.deploy \
    "$(jq -nc --arg id "$app_id" --arg title "GitHub Actions: $IMAGE_TAG" --arg note "${DEPLOY_NOTE:-}" \
      '{applicationId: $id, title: $title, description: $note}')" >/dev/null

  wait_for_deployment "$service" "$app_id" "$previous"
  log "$service: image pulled and service updated; waiting for the health check..."
  wait_for_rollout "$service" "$app_name" "$image" "$before"
  restore_app_id=''
  log "$service: healthy on $IMAGE_TAG"
  summary "| $service | \`$image\` | healthy |"
}

summary "### Deploy \`$IMAGE_TAG\`" "" "| Service | Image | Result |" "| --- | --- | --- |"
for service in "$@"; do
  deploy_service "$service"
done
log "Deployed $IMAGE_TAG: $*"
