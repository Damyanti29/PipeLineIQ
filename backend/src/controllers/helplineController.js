import { z } from 'zod'
import * as helplineService from '../services/helplineService.js'

// An empty or missing message is answered by the service with a friendly 400.
export const chatSchema = z.object({ message: z.string().max(1000, 'Questions are limited to 1000 characters').default('') })

export async function chat(req, res) {
  res.json({ data: await helplineService.answerQuestion(req.db, req.body.message) })
}
