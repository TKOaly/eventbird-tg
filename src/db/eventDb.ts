import { EventObject } from '../types'
import redis, { createClient, RedisClientType } from 'redis'
import { add, Duration } from 'date-fns'

type RedisClient = RedisClientType<
  redis.RedisModules,
  redis.RedisFunctions,
  redis.RedisScripts
>

const EVENTS_KEY_PREFIX = 'EVENTBIRD_POST_LOG'
const EXPIRE_AFTER_EVENT_START_PLUS: Duration = { months: 4 }

const getRedisConfig = () => {
  if (process.env.REDIS_PASSWORD) {
    return {
      password: process.env.REDIS_PASSWORD
    }
  }

  if (process.env.REDIS_URL) {
    return {
      url: process.env.REDIS_URL
    }
  }
}

export const withConnection = <T extends any[], R>(
  fn: (client: RedisClient, ...args: T) => Promise<R>
): ((...args: T) => Promise<R>) => async (...args) => {
  const connection = await createClient(getRedisConfig()).connect()
  return fn(connection, ...args).finally(() => connection.quit())
}

export const setPosted = withConnection((client, { id, ...event }: EventObject) =>
  client
    .set(`${EVENTS_KEY_PREFIX}#${id}`, 'true', {
      EXAT: add(new Date(event.starts), EXPIRE_AFTER_EVENT_START_PLUS).getTime(),
    })
    .then(() => ({ ...event, id }))
)

export const checkPostedStatus = withConnection((client, events: EventObject[]) =>
  client
    .mGet(events.map(e => `${EVENTS_KEY_PREFIX}#${e.id}`))
    .then(res => res.map(value => value === 'true'))
)
