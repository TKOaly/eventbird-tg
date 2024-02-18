import fi from 'date-fns/locale/fi'
import { format } from 'date-fns'
import * as R from 'remeda'
import axios from 'axios'

import { FoodList, LunchMenu } from '../types'
import { restaurants } from '../constants'
import { MAX_MESSAGE_SIZE } from './telegramService'

type Restaurant = keyof typeof restaurants

export const foodListByRestaurant = async (restaurant: Restaurant): Promise<string[]> => {
  const { foodList, restaurantName } = await fetchFoodList(restaurant)
  const header = `*Päivän ruoka:* \n\n*UniCafe ${restaurantName}:* \n\n`

  if (!foodList) return

  if (!foodList.length) {
    return [`${header} ei ruokaa 😭😭😭`.trim()]
  }

  return R.pipe(
    foodList,
    R.groupBy(({ price }) => price.name),
    createFoodList,
    ([first, ...rest]) => [`${header}${first}`, ...rest]
  )
}

const fetchFoodList = async (restaurant: Restaurant) => {
  const { data } = await axios.get<LunchMenu>(
    'http://messi.hyyravintolat.fi/publicapi/restaurant/' + restaurants[restaurant]
  )

  return parseFoodList(data)
}

const createFoodList = (groupedList: Record<string, FoodList[]>) => {
  const keys = Object.keys(groupedList)

  return R.reduce(
    keys,
    (prev, key) => {
      const joinedValues = R.reduce(
        groupedList[key],
        (prev, { name, warnings }) =>
          `${prev}  -  ${name} ${warnings.length !== 0 ? '_(' : ''}${warnings.join(
            ', '
          )}${warnings.length !== 0 ? ')_' : ''}\n`,
        ''
      )

      const newMessage = `${key}\n${joinedValues}\n\n`
      const combined = `${R.last(prev)}${newMessage}`

      if (combined.length > MAX_MESSAGE_SIZE) {
        return [...prev, newMessage]
      }

      const [head, last] = R.splitAt(prev, -1)
      return [...head, `${R.last(last)}${combined}`]
    },
    ['']
  )
}

const parseFoodList = ({ data, information }: LunchMenu) => {
  const now = new Date()
  const unicafeFormat = format(now, 'EEEEEE dd.MM', { locale: fi })

  const foodList = R.pipe(
    data,
    R.filter(({ date }) => date.toLowerCase() === unicafeFormat),
    R.flatMap(({ data }) => data),
    R.map(({ name, price, nutrition, ingredients, meta }) => ({
      name,
      price: {
        student: price.value.student,
        graduate: price.value.graduate,
        contract: price.value.contract,
        normal: price.value.normal,
        name: price.name,
      },
      nutrition,
      ingredients,
      warnings: meta['1'],
    }))
  )

  return {
    restaurantName: information.restaurant,
    foodList,
  }
}
