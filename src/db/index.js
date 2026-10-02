import { getDatabase } from './connection.js';
import { runMigrations } from './schema.js';
import { PostsRepository } from './postsRepository.js';
import { ProfilesRepository } from './profilesRepository.js';
import { VariantsRepository } from './variantsRepository.js';
import { SchedulesRepository } from './schedulesRepository.js';
import { PublishLogsRepository } from './publishLogsRepository.js';

export function createDatabaseContext(dbPath) {
  const db = getDatabase(dbPath);
  runMigrations(db);

  return {
    db,
    posts: new PostsRepository(db),
    profiles: new ProfilesRepository(db),
    variants: new VariantsRepository(db),
    schedules: new SchedulesRepository(db),
    publishLogs: new PublishLogsRepository(db),
  };
}
