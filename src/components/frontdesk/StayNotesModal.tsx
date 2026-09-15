'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  getStayNotesAction,
  createStayNoteAction,
  updateStayNoteAction,
} from '@/actions/frontdesk';
import {
  X,
  MessageSquare,
  Plus,
  Pencil,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Star,
  Lock,
} from 'lucide-react';

interface StayNotesModalProps {
  stayId: string;
  stayNumber: string;
  roomNumber: string;
  guestName: string;
  onClose: () => void;
}

interface StayNote {
  id: string;
  stayId: string;
  noteType: string;
  content: string;
  isEdited: boolean;
  createdAt: string;
  updatedAt: string;
  createdByName: string;
  updatedByName: string | null;
}

const NOTE_TYPE_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  OPERATIONAL: { label: 'Operational', color: 'bg-blue-100 text-blue-800', icon: <Clock className="w-2.5 h-2.5" /> },
  GUEST_PREFERENCE: { label: 'Guest Preference', color: 'bg-purple-100 text-purple-800', icon: <Star className="w-2.5 h-2.5" /> },
  ALERT: { label: 'Alert', color: 'bg-amber-100 text-amber-800', icon: <AlertTriangle className="w-2.5 h-2.5" /> },
  INTERNAL: { label: 'Internal', color: 'bg-gray-100 text-gray-800', icon: <Lock className="w-2.5 h-2.5" /> },
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function StayNotesModal({ stayId, stayNumber, roomNumber, guestName, onClose }: StayNotesModalProps) {
  const [notes, setNotes] = useState<StayNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingNote, setEditingNote] = useState<StayNote | null>(null);
  const [noteType, setNoteType] = useState<string>('OPERATIONAL');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const loadNotes = useCallback(async () => {
    const result = await getStayNotesAction(stayId);
    if (result.success && result.data) {
      setNotes(result.data as StayNote[]);
    }
    setLoading(false);
  }, [stayId]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const handleCreate = () => {
    setEditingNote(null);
    setNoteType('OPERATIONAL');
    setContent('');
    setShowForm(true);
  };

  const handleEdit = (note: StayNote) => {
    setEditingNote(note);
    setNoteType(note.noteType);
    setContent(note.content);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    setError(null);
    if (!content.trim()) {
      setError('Note content is required');
      return;
    }

    setSubmitting(true);
    if (editingNote) {
      const result = await updateStayNoteAction({
        id: editingNote.id,
        noteType,
        content: content.trim(),
      });
      if (result.success) {
        setSuccess('Note updated successfully');
        setShowForm(false);
        await loadNotes();
      } else {
        setError(result.error || 'Failed to update note');
      }
    } else {
      const result = await createStayNoteAction({
        stayId,
        noteType,
        content: content.trim(),
      });
      if (result.success) {
        setSuccess('Note created successfully');
        setShowForm(false);
        await loadNotes();
      } else {
        setError(result.error || 'Failed to create note');
      }
    }
    setSubmitting(false);
    setTimeout(() => setSuccess(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <Card
        className="w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="p-4 pb-2 border-b border-resort-sand">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-resort-charcoal flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-resort-forest" />
              Stay Notes
            </CardTitle>
            <button onClick={onClose} className="text-resort-muted hover:text-resort-charcoal">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-resort-muted">
            Stay: {stayNumber} | Room: {roomNumber} | Guest: {guestName}
          </p>
        </CardHeader>

        <CardContent className="p-4 space-y-3">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-rose-800 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-800 text-xs">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {!showForm && (
            <Button
              size="sm"
              onClick={handleCreate}
              className="w-full bg-resort-forest hover:bg-resort-forest-light text-white text-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Note
            </Button>
          )}

          {showForm && (
            <div className="p-3 bg-resort-sand-light rounded-lg space-y-3">
              <p className="text-xs font-semibold text-resort-charcoal-text">
                {editingNote ? 'Edit Note' : 'New Note'}
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs">Note Type</Label>
                <select
                  value={noteType}
                  onChange={(e) => setNoteType(e.target.value)}
                  className="w-full h-9 rounded-md border border-resort-sand bg-white px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-resort-forest"
                >
                  <option value="OPERATIONAL">Operational</option>
                  <option value="GUEST_PREFERENCE">Guest Preference</option>
                  <option value="ALERT">Alert</option>
                  <option value="INTERNAL">Internal</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Content *</Label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Enter note content..."
                  className="w-full rounded-md border border-resort-sand bg-white px-3 py-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-resort-forest resize-none h-20"
                  maxLength={1000}
                />
                <p className="text-[10px] text-resort-muted text-right">{content.length}/1000</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowForm(false)}
                  className="text-xs border-resort-sand"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={submitting}
                  onClick={handleSubmit}
                  className="bg-resort-forest hover:bg-resort-forest-light text-white text-xs"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Saving...
                    </>
                  ) : editingNote ? (
                    'Update Note'
                  ) : (
                    'Create Note'
                  )}
                </Button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-resort-forest" />
              <span className="ml-2 text-xs text-resort-muted">Loading notes...</span>
            </div>
          ) : notes.length === 0 ? (
            <div className="text-center py-6 text-resort-muted">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs">No notes yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notes.map((note) => {
                const config = NOTE_TYPE_CONFIG[note.noteType] || NOTE_TYPE_CONFIG.OPERATIONAL;
                return (
                  <div
                    key={note.id}
                    className="p-3 bg-white border border-resort-sand rounded-lg cursor-pointer hover:border-resort-forest/30 transition-colors"
                    onClick={() => handleEdit(note)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Badge className={`text-[9px] px-1.5 py-0 ${config.color}`}>
                            {config.icon}
                            <span className="ml-0.5">{config.label}</span>
                          </Badge>
                          {note.isEdited && (
                            <span className="text-[9px] text-resort-muted italic">(edited)</span>
                          )}
                        </div>
                        <p className="text-xs text-resort-charcoal-text whitespace-pre-wrap">{note.content}</p>
                      </div>
                      <Pencil className="w-3 h-3 text-resort-muted flex-shrink-0 mt-0.5" />
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-[10px] text-resort-muted">
                      <span>By {note.createdByName}</span>
                      <span>{formatDateTime(note.createdAt)}</span>
                      {note.updatedByName && (
                        <span>Updated by {note.updatedByName}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>

        <div className="p-4 pt-0 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs border-resort-sand"
          >
            Close
          </Button>
        </div>
      </Card>
    </div>
  );
}
