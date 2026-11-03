import { InMemoryWrapsRepository } from './wraps.repository';
import { describeWrapsRepository } from './wraps.repository.contract';

describeWrapsRepository('InMemoryWrapsRepository', () =>
  Promise.resolve(new InMemoryWrapsRepository()),
);
