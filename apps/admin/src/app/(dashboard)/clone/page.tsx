"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@vx/core-uikit/components";
import { ClonePage } from "@/views/clone-page";
import { ImportTab } from "@/components/clone/import-tab";
import { QueueTab } from "@/components/clone/queue-tab";

export default function CloneEntryPage() {
  return (
    <Tabs defaultValue="queue" className="w-full">
      <TabsList>
        <TabsTrigger value="queue">Queue</TabsTrigger>
        <TabsTrigger value="import">Import CSV</TabsTrigger>
        <TabsTrigger value="manual">Manual upload</TabsTrigger>
      </TabsList>
      <TabsContent value="queue">
        <QueueTab />
      </TabsContent>
      <TabsContent value="import">
        <ImportTab />
      </TabsContent>
      <TabsContent value="manual">
        <ClonePage />
      </TabsContent>
    </Tabs>
  );
}
