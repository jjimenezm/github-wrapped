export class InvalidLoginError extends Error {
  constructor() {
    super('That is not a valid GitHub username.');
    this.name = 'InvalidLoginError';
  }
}
