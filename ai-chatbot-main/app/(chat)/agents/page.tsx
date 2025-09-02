'use client'

import { AgentList } from '@/components/agent-list'
import { AgentRegistrationDialog } from '@/components/agent-registration-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { fetcher } from '@/lib/utils'
import useSWR from 'swr'

export default function AgentsPage() {
  const { data: agents, error, isLoading } = useSWR('/api/agents', fetcher)

  return (
    <div className="h-full flex flex-col p-4 md:p-6 gap-6">
      <header>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">
            A2A Agent Management
          </h1>
          <AgentRegistrationDialog />
        </div>
        <p className="text-muted-foreground mt-1">
          Register and manage your A2A agents here.
        </p>
      </header>
      <main className="flex-1">
        {isLoading && (
          <div className="space-y-2 rounded-md border p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
        {error && <p className="text-red-500">Failed to load agents.</p>}
        {agents && <AgentList agents={agents} />}
      </main>
    </div>
  )
}
