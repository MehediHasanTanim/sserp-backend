import { Factory } from 'fishery';
import { faker } from '@faker-js/faker';

export const userFactory = Factory.define<{
  id: string;
  username: string;
  email: string;
  password: string;
}>(({ sequence }) => ({
  id: faker.string.uuid(),
  username: `user${sequence}`,
  email: faker.internet.email().toLowerCase(),
  password: 'ValidPass1',
}));

export function createServiceMock<T extends object>(): jest.Mocked<T> {
  return {} as jest.Mocked<T>;
}
