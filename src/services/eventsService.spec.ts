import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('axios', () => ({ default: { get: vi.fn() } }))
vi.mock('../db/eventDb', () => ({
  setPosted: vi.fn(async (event: { id: number }) => event),
  checkPostedStatus: vi.fn(async (events: unknown[]) => events.map(() => false)),
}))

import axios from 'axios'
import { EventObject } from '../types'
import { MAX_MESSAGE_SIZE } from './telegramService'
import { pollEvents, todaysEvents } from './eventsService'

const makeEvent = (overrides: Partial<EventObject> = {}): EventObject => ({
  id: 1,
  name: ' Testitapahtuma ',
  user_id: 1,
  created: '2026-01-01T12:00:00',
  starts: '2026-01-01T18:00:00',
  registration_starts: '2025-12-01T12:00:00',
  registration_ends: '2025-12-31T23:00:00',
  cancellation_starts: '2025-12-01T12:00:00',
  cancellation_ends: '2025-12-31T23:00:00',
  location: 'Exactum',
  category: 'muu',
  description: 'kuvaus',
  deleted: 0,
  ...overrides,
})

const axiosGet = vi.mocked(axios.get)

describe('pollEvents', () => {
  beforeEach(() => {
    axiosGet.mockReset()
    axiosGet.mockResolvedValue({ data: [] })
  })

  it('returns unposted events in a single announcement message', async () => {
    axiosGet.mockResolvedValueOnce({
      data: [
        makeEvent({ id: 11 }),
        makeEvent({ id: 22, name: 'Toinen tapahtuma' }),
        makeEvent({ id: 33, deleted: 1 }),
      ],
    })

    const messages = await pollEvents()

    expect(messages).toHaveLength(1)
    expect(messages![0]).toContain('*Uusia tapahtumia:*')
    expect(messages![0]).toContain('[Testitapahtuma](https://tko-aly.fi/event/11)')
    expect(messages![0]).toContain('[Toinen tapahtuma](https://tko-aly.fi/event/22)')
    expect(messages![0]).not.toContain('/event/33')
  })

  it('chunks messages over the Telegram size limit', async () => {
    axiosGet.mockResolvedValueOnce({
      data: [makeEvent({ id: 1, name: 'a'.repeat(MAX_MESSAGE_SIZE) })],
    })

    const messages = await pollEvents()

    expect(messages!.length).toBeGreaterThan(1)
    expect(messages!.every(m => m.length <= MAX_MESSAGE_SIZE + 200)).toBe(true)
  })

  it('returns nothing when everything has been posted', async () => {
    const { checkPostedStatus } = await import('../db/eventDb')
    vi.mocked(checkPostedStatus).mockResolvedValueOnce([true, true])

    axiosGet.mockResolvedValueOnce({
      data: [makeEvent({ id: 1 }), makeEvent({ id: 2 })],
    })

    expect(await pollEvents()).toBeUndefined()
  })
})

describe('todaysEvents', () => {
  beforeEach(() => {
    axiosGet.mockReset()
    axiosGet.mockResolvedValue({ data: [] })
  })

  it('lists today’s events and today’s registration openings separately', async () => {
    const todayIso = new Date().toISOString()

    axiosGet.mockResolvedValueOnce({
      data: [
        makeEvent({ id: 1, starts: todayIso }),
        makeEvent({
          id: 2,
          starts: '2026-01-01T18:00:00',
          registration_starts: todayIso,
        }),
        makeEvent({ id: 3, starts: '2026-01-02T18:00:00' }),
      ],
    })

    const messages = await todaysEvents()

    expect(messages![0]).toContain('*Tänään:*')
    expect(messages![0]).not.toContain('/event/2')
    const joined = messages!.join('\n')
    expect(joined).toContain('Ilmo aukeaa')
    expect(joined).toContain('[Testitapahtuma](https://tko-aly.fi/event/2)')
    expect(joined).not.toContain('/event/3')
  })
})
