import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/app/(auth)/auth'
import { createAgent, getAgentsByUserId } from '@/lib/db/queries'
import { nanoid } from 'nanoid'
import { z } from 'zod'

export const GET = auth(async (req) => {
  if (!req.auth?.user?.id) {
    return new Response('Unauthorized', { status: 401 })
  }
  const userId = req.auth.user.id
  const agents = await getAgentsByUserId(userId)
  return NextResponse.json(agents)
})

// A simple AgentCard parser based on the demo project
async function getAgentCard(url: string) {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      return null
    }
    const card = await response.json()
    // Basic validation
    if (card.name && card.description && card.api_url) {
      return {
        name: card.name,
        description: card.description
      }
    }
    return null
  } catch (error) {
    console.error('Failed to fetch agent card:', error)
    return null
  }
}

const PostSchema = z.object({
  url: z.string().url()
})

export const POST = auth(async (req) => {
  if (!req.auth?.user?.id) {
    return new Response('Unauthorized', { status: 401 })
  }
  const userId = req.auth.user.id

  const body = await req.json()
  const parsed = PostSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const { url } = parsed.data

  const agentCard = await getAgentCard(url)

  if (!agentCard) {
    return NextResponse.json(
      { error: 'Failed to retrieve a valid AgentCard from the URL.' },
      { status: 400 }
    )
  }

  try {
    const newAgent = await createAgent({
      userId,
      url,
      name: agentCard.name,
      description: agentCard.description
    })
    return NextResponse.json(newAgent, { status: 201 })
  } catch (error) {
    // Handle potential unique constraint violation for the URL
    return NextResponse.json(
      { error: 'This agent URL is already registered.' },
      { status: 409 }
    )
  }
})
