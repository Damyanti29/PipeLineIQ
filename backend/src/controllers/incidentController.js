import { z } from 'zod'
import * as incidentService from '../services/incidentService.js'

export const listQuerySchema = z.object({
  status: z.enum(incidentService.INCIDENT_STATUSES).optional(),
  repositoryId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
})

export const statusSchema = z.object({ status: z.enum(incidentService.INCIDENT_STATUSES) })

export async function list(req, res) {
  res.json({ data: await incidentService.listIncidents(req.db, req.validatedQuery) })
}

export async function get(req, res) {
  res.json({ data: await incidentService.getIncident(req.db, req.params.id) })
}

export async function updateStatus(req, res) {
  res.json({ data: await incidentService.updateIncidentStatus(req.db, req.params.id, req.body.status) })
}

export async function createGithubIssue(req, res) {
  // Ownership is checked against req.user (from the verified token) inside the service.
  const { incident, created } = await incidentService.createGithubIssue(req.params.id, req.user.id)
  res.status(created ? 201 : 200).json({
    data: {
      created,
      github_issue_number: incident.github_issue_number,
      github_issue_url: incident.github_issue_url,
    },
  })
}
