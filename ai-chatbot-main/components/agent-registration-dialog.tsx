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
import { PlusIcon, LoaderIcon } from './icons'
import { toast } from './toast'
import { mutate } from 'swr'

type AgentCard = {
  name: string
  description: string
  api_url: string
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
    if (!url) {
      setError('Please enter a URL.')
      return
    }
    setIsFetchingCard(true)
    try {
      const res = await fetch('/api/agents/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const result = await res.json()
      if (!res.ok) {
        throw new Error(result.error || 'Could not fetch agent information from the URL.')
      }
      setAgentCard(result)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setIsFetchingCard(false)
    }
  }

  const handleSave = async () => {
    if (!url || !agentCard) return
    setIsSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          name: agentCard.name,
          description: agentCard.description,
        }),
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
          <PlusIcon size={16} />
          <span className="ml-2">Add New Agent</span>
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
              placeholder="http://localhost:10000 or https://example-agent.com"
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleFetchCard} disabled={isFetchingCard || !url}>
              {isFetchingCard && <LoaderIcon size={16} />}
              <span className={isFetchingCard ? "ml-2" : ""}>Fetch Agent Info</span>
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
            {isSaving && <LoaderIcon size={16} />}
            <span className={isSaving ? "ml-2" : ""}>Register Agent</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
