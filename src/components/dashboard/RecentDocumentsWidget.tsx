import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Download, Clock, ShieldCheck, FileIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

export default function RecentDocumentsWidget() {
  const { userProfile } = useAuth();

  const { data: documents, isLoading } = useQuery({
    queryKey: ["recent-documents", userProfile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_documents")
        .select(`
          id,
          file_name,
          document_type,
          created_at,
          file_path,
          employees (name, rank)
        `)
        .eq("company_id", userProfile!.company_id!)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      return data;
    },
    enabled: !!userProfile?.company_id,
  });

  const handleDownload = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from("employee-documents")
        .download(filePath);
      if (error) throw error;
      
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast.error(`Download failed: ${error.message}`);
    }
  };

  const getDocIcon = (type: string) => {
    switch(type) {
      case 'id_proof': return <ShieldCheck className="h-4 w-4 text-blue-500" />;
      case 'contract': return <FileText className="h-4 w-4 text-purple-500" />;
      default: return <FileIcon className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const formatDocType = (type: string) => {
    return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  return (
    <Card className="border-border/60 bg-card shadow-sm h-full flex flex-col rounded-xl overflow-hidden">
      <CardHeader className="pb-3 p-4 shrink-0 bg-gradient-to-r from-muted/50 to-transparent border-b border-border/40">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2.5 text-foreground text-sm font-black">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
              <FileText className="h-3.5 w-3.5 text-indigo-500" />
            </div>
            Recent Documents
          </CardTitle>
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider bg-muted/50 px-2 py-0.5 rounded-full">
            Latest 5
          </span>
        </div>
      </CardHeader>
      
      <CardContent className="p-0 flex-1 overflow-y-auto scrollbar-hide">
        {isLoading ? (
          <div className="p-4 space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-[60%]" />
                  <Skeleton className="h-3 w-[40%]" />
                </div>
              </div>
            ))}
          </div>
        ) : documents?.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center px-4">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <FileIcon className="h-5 w-5 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">No documents uploaded yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {documents?.map((doc: any) => (
              <div key={doc.id} className="p-4 hover:bg-muted/20 transition-colors flex items-center justify-between group">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-background border border-border/50 shadow-sm flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    {getDocIcon(doc.document_type)}
                  </div>
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {doc.employees?.name || 'Unknown Employee'}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-medium text-muted-foreground truncate bg-muted px-1.5 py-0.5 rounded-md">
                        {formatDocType(doc.document_type)}
                      </span>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>
                
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="shrink-0 h-8 w-8 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10"
                  onClick={() => handleDownload(doc.file_path, doc.file_name)}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
