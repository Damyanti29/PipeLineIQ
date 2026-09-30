import { z } from 'zod'
import * as repositoryService from '../services/repositoryService.js'

export const createSchema = z.object({ githubRepoId: z.coerce.number().int().positive() })
export const updateSchema = z.object({ monitoringEnabled: z.boolean() })

export async function list(req, res) {
  res.json({ data: await repositoryService.listRepositories(req.db) })
}

export async function get(req, res) {
  res.json({ data: await repositoryService.getRepository(req.db, req.params.id) })
}

// The owner is always the authenticated user; any user_id in the body is ignored by the schema.
export async function create(req, res) {
  const repository = await repositoryService.addRepository(req.user.id, req.body.githubRepoId)
  res.status(201).json({ data: repository })
}

export async function update(req, res) {
  res.json({ data: await repositoryService.setMonitoring(req.db, req.params.id, req.body.monitoringEnabled) })
}

export async function events(req, res) {
  res.json({ data: await repositoryService.listRepositoryEvents(req.db, req.params.id) })
}
