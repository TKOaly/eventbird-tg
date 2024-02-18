import axios from 'axios'
import { format, formatISO, isToday, parseISO, sub } from 'date-fns'
import fi from 'date-fns/locale/fi'
import * as R from 'remeda'

import { setPosted, checkPostedStatus } from '../db/eventDb'
import { EventObject } from '../types'
import { MAX_MESSAGE_SIZE } from './telegramService'

export const todaysEvents = async (): Promise<string[]> => {
  const events = await retrieveEvents()
  const eventsToday = R.filter(events, e => isToday(parseISO(e.starts)))

  const registrationToday = R.filter(events, e =>
    isToday(parseISO(e.registration_starts))
  )

  if (eventsToday?.length > 0 || registrationToday?.length > 0) {
    const [todayFirst, ...todayLast] = listEvents(eventsToday, 'HH:mm', false)
    return [
      `*Tänään:* \n ${todayFirst}`,
      ...todayLast,
      ...listEvents(registrationToday, 'HH:mm', true),
    ]
  }
}

export const pollEvents = async (): Promise<string[]> => {
  const events = await retrieveEvents()
  const filteredEvents = await filterPostedEvents(events)
  const addedEvents = await R.pipe(filteredEvents, R.map(setPosted), promises =>
    Promise.all(promises)
  )
  return newEvents(addedEvents)
}

const retrieveEvents = async () => {
  const { data } = await axios.get<EventObject[]>(
    `https://event-api.tko-aly.fi/api/events?fromDate=${formatISO(
      sub(Date.now(), { months: 3 }),
      { representation: 'date' }
    )}`
  )

  return R.filter(data, e => e.deleted === 0)
}

const newEvents = (events: EventObject[]) => {
  if (!events || events.length === 0) return

  const eventHeader =
    events.length > 1 ? '*Uusia tapahtumia:* \n' : '*Uusi tapahtuma:* \n'

  const [first, ...rest] = listEvents(events, 'dd.MM.yyy HH:mm', false)
  const messages = [`${eventHeader}${first}`, ...rest]
  return messages
}

const listEvents = (
  events: EventObject[],
  dateFormat: string,
  showRegistrationTimes: boolean
) =>
  R.pipe(
    events,
    R.map(formatEvents(dateFormat, showRegistrationTimes)),
    R.reduce(
      (response, event) => {
        const newRow = `${event} \n`
        const combined = `${R.last(response)}${newRow}`

        if (combined.length >= MAX_MESSAGE_SIZE) {
          return [...response, newRow]
        }

        const [head, last] = R.splitAt(response, -1)
        return [...head, `${R.last(last)}${newRow}`]
      },
      ['']
    )
  )

const formatEvents = (dateFormat: string, showRegistration: boolean) => (
  event: EventObject
) => {
  const prefix = showRegistration
    ? `Ilmo aukeaa ${format(parseISO(event.registration_starts), dateFormat, {
        locale: fi,
      })}`
    : format(parseISO(event.starts), dateFormat, {
        locale: fi,
      })

  return `${prefix}: [${event.name.trim()}](https://tko-aly.fi/event/${event.id})`
}

const filterPostedEvents = async (data: EventObject[]) => {
  const isPosted = await checkPostedStatus(data)
  return R.zip(data, isPosted)
    .filter(([_, posted]) => !posted)
    .map(([event, _]) => event)
}
