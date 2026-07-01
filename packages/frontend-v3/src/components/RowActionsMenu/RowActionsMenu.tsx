"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUpdateStage } from "@/hooks/use-opportunities";
import { useAssignOwner, usePassOpportunity, useAddNote, useUpdateTags } from "@/hooks/use-opportunity-actions";
import { UserPicker } from "./UserPicker";
import { TagPicker } from "./TagPicker";
import { NoteModal } from "./NoteModal";
import { ALL_STAGES, LABEL_TO_DB_KEY, isStagingStage, type Stage } from "@/lib/stages";

interface RowActionsMenuProps {
  opportunityId: string;
  sourceUri: string | null;
  currentTags: string[];
}

export function RowActionsMenu({
  opportunityId,
  sourceUri,
  currentTags,
}: RowActionsMenuProps) {
  const [showPassConfirm, setShowPassConfirm] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const { toast } = useToast();

  const updateStage = useUpdateStage();
  const assignOwner = useAssignOwner();
  const passOpp = usePassOpportunity();
  const addNote = useAddNote();
  const updateTags = useUpdateTags();

  function handleOpenSource(e: React.MouseEvent) {
    e.stopPropagation();
    if (sourceUri) {
      window.open(sourceUri, "_blank", "noopener,noreferrer");
    }
  }

  function handleAddToPipeline() {
    updateStage.mutate(
      { id: opportunityId, stage: "qualified" },
      {
        onSuccess: () => toast("Moved to Qualified", "success"),
        onError: (err) =>
          toast(`Failed to move to pipeline: ${err.message}`, "error"),
      },
    );
  }

  function handleStageMove(stage: Stage) {
    const dbKey = LABEL_TO_DB_KEY[stage];
    updateStage.mutate(
      { id: opportunityId, stage: dbKey },
      {
        onSuccess: () => toast(`Stage moved to ${stage}`, "success"),
        onError: (err) =>
          toast(`Failed to move stage: ${err.message}`, "error"),
      },
    );
  }

  function handleAssign(userId: number, displayName: string) {
    assignOwner.mutate(
      { id: opportunityId, ownerId: userId },
      {
        onSuccess: () => {
          toast(`Assigned to ${displayName}`, "success");
          setShowAssign(false);
        },
        onError: (err) =>
          toast(`Failed to assign: ${err.message}`, "error"),
      },
    );
  }

  function handleTagUpdate(tags: string[]) {
    updateTags.mutate(
      { id: opportunityId, tags },
      {
        onSuccess: () => {
          toast("Tags updated", "success");
          setShowTags(false);
        },
        onError: (err) =>
          toast(`Failed to update tags: ${err.message}`, "error"),
      },
    );
  }

  function handleAddNote(body: string) {
    addNote.mutate(
      { id: opportunityId, body },
      {
        onSuccess: () => {
          toast("Note added", "success");
          setShowNote(false);
        },
        onError: (err) =>
          toast(`Failed to add note: ${err.message}`, "error"),
      },
    );
  }

  function handlePass() {
    passOpp.mutate(
      { id: opportunityId },
      {
        onSuccess: () => {
          toast("Opportunity marked as Passed", "success");
          setShowPassConfirm(false);
        },
        onError: (err) => {
          toast(`Failed to pass: ${err.message}`, "error");
          setShowPassConfirm(false);
        },
      },
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:bg-gda-panel transition-colors text-base leading-none"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          aria-label="Row actions"
        >
          ⋮
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="bottom" sideOffset={4}>
          {sourceUri && (
            <DropdownMenuItem onClick={handleOpenSource}>
              Open Source
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={handleAddToPipeline}>
            Add to Pipeline
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Move to Stage…</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {ALL_STAGES.filter(
                (stage) => !isStagingStage(LABEL_TO_DB_KEY[stage]),
              ).map((stage) => (
                <DropdownMenuItem
                  key={stage}
                  onClick={() => handleStageMove(stage)}
                >
                  {stage}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowPassConfirm(true)}>
                Passed
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowAssign(true)}>
            Assign…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowTags(true)}>
            Tag…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowNote(true)}>
            Add Note
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setShowPassConfirm(true)}
          >
            Pass
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Pass confirmation dialog */}
      <Dialog open={showPassConfirm} onOpenChange={setShowPassConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pass on this opportunity?</DialogTitle>
            <DialogDescription>
              This will mark the opportunity as Passed, removing it from active
              views. This action can be reversed by moving the opportunity back
              to an active stage.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowPassConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handlePass}
              disabled={passOpp.isPending}
            >
              {passOpp.isPending ? "Passing…" : "Confirm Pass"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign user picker */}
      <UserPicker
        open={showAssign}
        onOpenChange={setShowAssign}
        onSelect={handleAssign}
      />

      {/* Tag picker */}
      <TagPicker
        open={showTags}
        onOpenChange={setShowTags}
        currentTags={currentTags}
        onSave={handleTagUpdate}
      />

      {/* Note modal */}
      <NoteModal
        open={showNote}
        onOpenChange={setShowNote}
        onSave={handleAddNote}
        isPending={addNote.isPending}
      />
    </>
  );
}
