import axios from 'axios'
import { channels, config } from '../constants'

type Channel = keyof typeof channels

export const MAX_MESSAGE_SIZE = 4096 - 200 // For headers and such

export const sendMessage = (channel: Channel, disableWebPagePreview: boolean) => async (
  messages: string[]
) => {
  if (!messages) return

  for (const message of messages) {
    await axios.post(
      `https://api.telegram.org/bot${config.telegramAPIToken}/sendMessage`,
      {
        chat_id: channels[channel],
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: disableWebPagePreview,
      }
    )
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}
