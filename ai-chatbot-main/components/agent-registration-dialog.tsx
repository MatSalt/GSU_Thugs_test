'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PlusIcon } from './icons'
import { toast } from './toast'
import { mutate } from 'swr'
import { LoaderIcon } from './icons'

type AgentCard = {
  name: string
  description: string
}

export function AgentRegistrationDialog() {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [isFetchingCard, setIsFetchingCard] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [agentCard, setAgentCard] = useState<AgentCard | null>(null)
  const [error, setError] = useState<string | null>(null)

  const resetState = () => {
    setUrl('')
    setIsFetchingCard(false)
    setIsSaving(false)
    setAgentCard(null)
    setError(null)
  }

  const handleFetchCard = async () => {
    setError(null)
    setAgentCard(null)
    if (!url || !url.startsWith('http')) {
      setError('Please enter a valid URL.')
      return
    }
    setIsFetchingCard(true)
    try {
      const res = await fetch(url)
      if (!res.ok) {
        throw new Error('Could not fetch agent information from the URL.')
      }
      const card = await res.json()
      if (card.name && card.description && card.api_url) {
        setAgentCard({ name: card.name, description: card.description })
      } else {
        throw new Error('The URL did not return a valid AgentCard.')
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setIsFetchingCard(false)
    }
  }

  const handleSave = async () => {
    if (!url) return
    setIsSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const result = await res.json()
      if (!res.ok) {
        throw new Error(result.error || 'Failed to register agent.')
      }
      toast({ type: 'success', description: 'Agent registered successfully!' })
      mutate('/api/agents')
      setOpen(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen)
        if (!isOpen) {
          resetState()
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <PlusIcon className="mr-2 h-4 w-4" />
          Add New Agent
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Register a new A2A Agent</DialogTitle>
          <DialogDescription>
            Enter the URL of the AgentCard to register it.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="url" className="text-right">
              URL
            </Label>
            <Input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="col-span-3"
              placeholder="https://example-agent.com/agent_card.json"
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleFetchCard} disabled={isFetchingCard || !url}>
              {isFetchingCard && <LoaderIcon className="mr-2 animate-spin" />}
              Fetch Agent Info
            </Button>
          </div>
          {agentCard && (
            <div className="p-4 border rounded-md bg-muted">
              <h4 className="font-semibold">{agentCard.name}</h4>
              <p className="text-sm text-muted-foreground">{agentCard.description}</p>
            </div>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!agentCard || isSaving}>
            {isSaving && <LoaderIcon className="mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
