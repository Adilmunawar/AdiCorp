import React, { useState } from "react";
import { useEmployeePortalData } from "@/hooks/useEmployeePortalData";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO } from "date-fns";
import { FileText, Download, ShieldCheck, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function PortalReports() {
  const { data, isLoading } = useEmployeePortalData();
  const [viewDocument, setViewDocument] = useState<{ url: string, name: string, type: string } | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-3xl" />
        <Skeleton className="h-24 w-full rounded-3xl" />
      </div>
    );
  }

  const documents = data?.documents || [];

  const handleViewDocument = async (filePath: string, fileName: string, mimeType: string) => {
    try {
      const { data, error } = await supabase.storage.from("employee-documents").download(filePath);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      setViewDocument({ url, name: fileName, type: mimeType });
    } catch (error: any) {
      toast.error(`Failed to load document: ${error.message}`);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 mb-6">
      <div className="flex items-center justify-between px-2 mb-2">
        <h2 className="text-lg font-black tracking-tight text-foreground">Compliance Documents</h2>
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5" /> Secure
        </span>
      </div>

      {documents.length === 0 ? (
        <Card className="border-border/40 shadow-sm rounded-3xl">
          <CardContent className="p-8 text-center text-muted-foreground text-sm flex flex-col items-center justify-center gap-2">
            <FileText className="w-8 h-8 opacity-20" />
            No documents uploaded yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {documents.map((doc: any) => (
            <Card key={doc.id} className="border-border/40 shadow-sm rounded-3xl overflow-hidden hover:bg-muted/30 transition-colors">
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 pr-2">
                    <p className="text-sm font-bold text-foreground truncate">{doc.document_name}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
                      {doc.document_type.replace('_', ' ')} • {format(parseISO(doc.created_at), 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-8 w-8 rounded-full border-border/50 text-primary shrink-0"
                  onClick={() => handleViewDocument(doc.file_path, doc.document_name, doc.mime_type || 'application/pdf')}
                >
                  <Eye className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Document Viewer Dialog */}
      <Dialog 
        open={!!viewDocument} 
        onOpenChange={(open) => {
          if (!open) {
            if (viewDocument?.url) URL.revokeObjectURL(viewDocument.url);
            setViewDocument(null);
          }
        }}
      >
        <DialogContent className="max-w-[100vw] h-[100dvh] sm:max-w-4xl sm:h-[85vh] flex flex-col overflow-hidden p-0 m-0 sm:rounded-2xl border-none sm:border-solid">
          <DialogHeader className="p-4 border-b border-border/50 shrink-0 bg-background/80 backdrop-blur-md">
            <DialogTitle className="text-lg pr-8 truncate">{viewDocument?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-muted/20 relative p-4 flex items-center justify-center">
            {viewDocument?.type.startsWith('image/') ? (
              <img 
                src={viewDocument.url} 
                alt={viewDocument.name}
                className="max-w-full max-h-full object-contain rounded-lg shadow-sm"
              />
            ) : viewDocument?.url ? (
              <iframe 
                src={viewDocument.url} 
                title={viewDocument.name}
                className="w-full h-full rounded-lg shadow-sm bg-white"
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
