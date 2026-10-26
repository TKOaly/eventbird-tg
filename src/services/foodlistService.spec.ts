import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('axios', () => ({ default: { get: vi.fn() } }))

import axios from 'axios'
import { format } from 'date-fns'
import { fi } from 'date-fns/locale'
import { LunchMenu } from '../types'
import { MAX_MESSAGE_SIZE } from './telegramService'
import { foodListByRestaurant } from './foodlistService'

const axiosGet = vi.mocked(axios.get)

const todaysDateField = format(new Date(), 'EEEEEE dd.MM', { locale: fi })
const otherDateField = 'tiistai 27.10.'

const makeDatum = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  name: 'Kana-curry',
  name_en: 'Chicken curry',
  name_sv: 'Kycklingcurry',
  sku: '123',
  ingredients: 'riisi, kana',
  nutrition: '',
  price: {
    value: {
      student: '2.95',
      graduate: '5.10',
      contract: '5.10',
      normal: '7.30',
      student_hyy: '',
      graduate_hyy: '',
    },
    name: 'Edullisesti',
  },
  meta: { 0: [], 1: ['L', 'G'], 2: [] },
  ...overrides,
})

const makeLunchMenu = (data: Record<string, unknown>[]): LunchMenu =>
  ({
    status: 'ok',
    data: [
      { date: otherDateField, date_en: '', date_sv: '', message: null, data: [] },
      { date: todaysDateField, date_en: '', date_sv: '', message: null, data },
    ],
    information: {
      restaurant: 'Exactum',
      zip: '',
      hide_prices: 0,
      phone: '',
      lounas: { regular: [], exception: [] },
      address: '',
      breakfast: { exception: [], name: '', regular: [] },
      business: { exception: [], regular: [] },
      description_sv: '',
      description_en: '',
      city: '',
      email: '',
      feedback_address: '',
      description: '',
      bistro: { name: '', exception: [], regular: [] },
    },
  }) as unknown as LunchMenu

describe('foodListByRestaurant', () => {
  beforeEach(() => {
    axiosGet.mockReset()
    axiosGet.mockResolvedValue({ data: makeLunchMenu([]) })
  })

  it('formats today’s menu grouped by price, with italicised warnings', async () => {
    axiosGet.mockResolvedValueOnce({
      data: makeLunchMenu([
        makeDatum(),
        makeDatum({
          name: 'Kasviskeitto',
          price: { value: {}, name: 'Kasvis' },
          meta: { 0: [], 1: [], 2: [] },
        }),
      ]),
    })

    const messages = await foodListByRestaurant('exactum')

    expect(axiosGet.mock.calls[0][0]).toContain(
      'messi.hyyravintolat.fi/publicapi/restaurant/11',
    )
    expect(messages).toHaveLength(1)
    expect(messages![0]).toContain('*Päivän ruoka:*')
    expect(messages![0]).toContain('*UniCafe Exactum:*')
    expect(messages![0]).toContain('Edullisesti')
    expect(messages![0]).toContain('  -  Kana-curry _(L, G)_\n')
    expect(messages![0]).toContain('Kasvis')
    expect(messages![0]).not.toContain('Kasviskeitto (')
    expect(messages![0].length).toBeLessThanOrEqual(MAX_MESSAGE_SIZE)
  })

  it('posts a sad message when there is no food today', async () => {
    axiosGet.mockResolvedValueOnce({ data: makeLunchMenu([]) })

    const messages = await foodListByRestaurant('chemicum')

    expect(axiosGet.mock.calls[0][0]).toContain(
      'messi.hyyravintolat.fi/publicapi/restaurant/10',
    )
    expect(messages).toHaveLength(1)
    expect(messages![0]).toContain('*UniCafe Exactum:*')
    expect(messages![0]).toContain('ei ruokaa')
  })
})
