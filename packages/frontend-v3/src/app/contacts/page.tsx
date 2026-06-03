"use client";

import { PendingState } from "@/components/shared/pending-state";
import { SourceChip } from "@/components/shared/source-chip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function ContactsPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-mono text-lg font-bold text-foreground">
        Contacts
      </h1>
      <p className="text-sm text-muted-foreground">
        CRM-lite contact database. Track Gov, Academia, Industry, and Partner
        contacts with last-activity and needs/capabilities.
      </p>

      <PendingState
        surface="Contacts"
        reason="Activates with the contact management backend. Will show a sortable/searchable table of contacts with type badges (Gov/Academia/Industry/Partner), last activity date, and needs/capabilities."
      />

      <Card className="border-border bg-gda-panel">
        <CardHeader>
          <CardTitle className="font-mono text-sm text-muted-foreground">
            Table Preview (schema ready)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gda-bg-base text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Name</th>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium">Organization</th>
                  <th className="px-3 py-2 text-left font-medium">Role</th>
                  <th className="px-3 py-2 text-left font-medium">Last Activity</th>
                  <th className="px-3 py-2 text-left font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td colSpan={6} className="px-3 py-6 text-center text-xs text-muted-foreground italic">
                    Pending backend integration — real contacts will appear here
                    <div className="mt-2">
                      <SourceChip label="Contact DB pending" kind="pending" />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex gap-2">
            <Badge variant="outline" className="text-[11px] border-gda-cyan/30 text-gda-cyan">Gov</Badge>
            <Badge variant="outline" className="text-[11px] border-gda-purple/30 text-gda-purple">Academia</Badge>
            <Badge variant="outline" className="text-[11px] border-gda-amber/30 text-gda-amber">Industry</Badge>
            <Badge variant="outline" className="text-[11px] border-gda-green/30 text-gda-green">Partner</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
