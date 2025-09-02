import { auth } from '@/app/(auth)/auth'
import { deleteAgentById } from '@/lib/db/queries'
import { NextResponse } from 'next/server'

export const DELETE = auth(
  async (req, { params }: { params: { id: string } }) => {
    if (!req.auth?.user?.id) {
      return new Response('Unauthorized', { status: 401 })
    }
    const userId = req.auth.user.id
    const agentId = params.id

    try {
      await deleteAgentById(agentId, userId)
      return NextResponse.json({ success: true }, { status: 200 })
    } catch (error) {
      return NextResponse.json(
        { error: 'Failed to delete agent.' },
        { status: 500 }
      )
    }
  }
)
