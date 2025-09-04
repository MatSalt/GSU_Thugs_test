import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/app/(auth)/auth'
import { z } from 'zod'

// A2A Agent Card well-known path constant (same as a2a-sdk)
const AGENT_CARD_WELL_KNOWN_PATH = '/.well-known/agent-card.json'

// A simple AgentCard parser based on the demo project
async function getAgentCard(url: string) {
  try {
    // Ensure URL has protocol
    let agentUrl = url
    if (!agentUrl.startsWith('http://') && !agentUrl.startsWith('https://')) {
      agentUrl = 'http://' + agentUrl
    }
    
    // Remove trailing slash to avoid double slashes
    agentUrl = agentUrl.replace(/\/$/, '')
    
    // Add well-known agent card path
    const agentCardUrl = `${agentUrl}${AGENT_CARD_WELL_KNOWN_PATH}`
    
    const response = await fetch(agentCardUrl)
    if (!response.ok) {
      return null
    }
    const card = await response.json()
    // Basic validation
    if (card.name && card.description && card.api_url) {
      return {
        name: card.name,
        description: card.description,
        api_url: card.api_url
      }
    }
    return null
  } catch (error) {
    console.error('Failed to fetch agent card:', error)
    return null
  }
}

const ValidateSchema = z.object({
  url: z.string().min(1, 'URL is required')
})

export const POST = auth(async (req) => {
  if (!req.auth?.user?.id) {
    return new Response('Unauthorized', { status: 401 })
  }

  const body = await req.json()
  const parsed = ValidateSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ 
      error: 'Invalid input',
      details: parsed.error.errors 
    }, { status: 400 })
  }

  const { url } = parsed.data

  // Validate URL format (allow localhost and basic URLs)
  const isValidUrl = url.includes('localhost') || url.startsWith('http://') || url.startsWith('https://')
  if (!isValidUrl) {
    return NextResponse.json({
      error: 'Please enter a valid URL (e.g., http://localhost:10000 or https://example.com)'
    }, { status: 400 })
  }

  const agentCard = await getAgentCard(url)

  if (!agentCard) {
    return NextResponse.json(
      { error: 'Failed to retrieve a valid AgentCard from the URL. Please check if the agent is running and accessible.' },
      { status: 400 }
    )
  }

  return NextResponse.json(agentCard, { status: 200 })
})
