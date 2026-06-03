import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import DashboardLayout from "@/components/layout/Dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Download, AlertCircle, CheckCircle2, XCircle, Search, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function DocumentTracking() {
  const { userProfile } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [uploading, setUploading] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<{ employeeId: string, type: string } | null>(null);
  const [viewDocument, setViewDocument] = useState<{ url: string, name: string, type: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: employeesData, isLoading: employeesLoading } = useQuery({
    queryKey: ['doc-tracking-employees', userProfile?.company_id],
    queryFn: async () => {
      if (!userProfile?.company_id) return [];
      const { data, error } = await supabase
        .from('employees')
        .select('id, name, rank, status')
        .eq('company_id', userProfile.company_id)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!userProfile?.company_id,
  });

  const { data: documentsData, isLoading: documentsLoading } = useQuery({
    queryKey: ['doc-tracking-documents', userProfile?.company_id],
    queryFn: async () => {
      if (!userProfile?.company_id) return [];
      const { data, error } = await supabase
        .from('employee_documents')
        .select('*')
        .eq('company_id', userProfile.company_id);
      if (error) throw error;
      return data;
    },
    enabled: !!userProfile?.company_id,
  });

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

  const handleUploadClick = (employeeId: string, type: string) => {
    setUploadTarget({ employeeId, type });
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !uploadTarget || !userProfile?.company_id) return;
    
    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${uploadTarget.employeeId}-${uploadTarget.type}-${Date.now()}.${fileExt}`;
      const filePath = `${userProfile.company_id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('employee-documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { error: dbError, data: dbData } = await supabase
        .from('employee_documents')
        .insert({
          employee_id: uploadTarget.employeeId,
          company_id: userProfile.company_id,
          document_type: uploadTarget.type as any,
          document_name: file.name,
          file_name: file.name,
          file_path: filePath,
          mime_type: file.type || 'application/octet-stream',
          file_size: file.size,
          uploaded_by: userProfile?.id || null
        })
        .select();

      if (dbError) {
        console.error("DB INSERT ERROR:", dbError);
        throw dbError;
      }

      toast.success("Document uploaded successfully");
      queryClient.invalidateQueries({ queryKey: ['doc-tracking-documents'] });
    } catch (error: any) {
      toast.error(`Upload failed: ${error.message}`);
    } finally {
      setUploading(false);
      setUploadTarget(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (employeesLoading || documentsLoading) {
    return (
      <DashboardLayout title="Document Tracking">
        <div className="space-y-6">
          <Skeleton className="h-32 w-full rounded-3xl" />
          <Skeleton className="h-[500px] w-full rounded-3xl" />
        </div>
      </DashboardLayout>
    );
  }

  const employees = employeesData || [];
  const documents = documentsData || [];

  const getDocForEmployee = (empId: string, type: string) => {
    return documents.find(d => d.employee_id === empId && d.document_type === type);
  };

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (filterStatus === "all") return matchesSearch;
    
    const missingDocs = (!getDocForEmployee(emp.id, 'id_copy')) || (!getDocForEmployee(emp.id, 'certificate')) || (!getDocForEmployee(emp.id, 'contract'));
    
    if (filterStatus === "complete") return matchesSearch && !missingDocs;
    if (filterStatus === "missing") return matchesSearch && missingDocs;
    
    return matchesSearch;
  });

  const getMissingCount = () => {
    let count = 0;
    employees.forEach(emp => {
      if (!getDocForEmployee(emp.id, 'id_copy')) count++;
      if (!getDocForEmployee(emp.id, 'certificate')) count++;
      if (!getDocForEmployee(emp.id, 'contract')) count++;
    });
    return count;
  };

  const missingCount = getMissingCount();

  return (
    <DashboardLayout title="Document Tracking">
      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" />
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Header Stats */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="rounded-2xl border border-border/50 bg-card shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Total Docs</p>
                <p className="text-xl font-bold">{documents.length}</p>
              </div>
            </CardContent>
          </Card>
          
          <Card className="rounded-2xl border border-border/50 bg-card shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Missing</p>
                <p className="text-xl font-bold text-destructive">{missingCount}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Tracking Matrix */}
        <Card className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <CardHeader className="bg-muted/10 border-b border-border/50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Compliance Matrix</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Track required documents across all employees.</p>
            </div>
            <div className="flex items-center gap-2 max-w-sm w-full">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground h-3.5 w-3.5" />
                <Input
                  placeholder="Search employees..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 rounded-lg h-8 text-xs bg-background border-border/50"
                />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-8 text-xs w-[130px] rounded-lg">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="complete">Complete</SelectItem>
                  <SelectItem value="missing">Missing</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="min-w-[600px] text-xs">
                <TableHeader className="bg-muted/30 border-b border-border/50">
                  <TableRow className="hover:bg-transparent h-10">
                    <TableHead className="py-2 pl-4">Employee</TableHead>
                    <TableHead className="py-2 text-center">CNIC / ID Copy</TableHead>
                    <TableHead className="py-2 text-center">Education Degree</TableHead>
                    <TableHead className="py-2 text-center">Contract</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEmployees.map((emp) => {
                    const cnicDoc = getDocForEmployee(emp.id, 'id_copy');
                    const degreeDoc = getDocForEmployee(emp.id, 'certificate');
                    const contractDoc = getDocForEmployee(emp.id, 'contract');

                    const renderDocStatus = (doc: any, label: string, type: string) => {
                      if (doc) {
                        return (
                          <div className="flex flex-row items-center justify-center gap-2">
                            <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-700 border-green-500/20 gap-1 pl-1 pr-1.5 py-0 h-5">
                              <CheckCircle2 className="h-2.5 w-2.5" /> Uploaded
                            </Badge>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-6 text-[10px] text-primary hover:bg-primary/10 px-2"
                              onClick={() => handleViewDocument(doc.file_path, doc.file_name, doc.mime_type || 'application/pdf')}
                            >
                              <FileText className="h-3 w-3 mr-1" /> View
                            </Button>
                          </div>
                        );
                      }
                      
                      const isThisUploading = uploading && uploadTarget?.employeeId === emp.id && uploadTarget?.type === type;
                      
                      return (
                        <div className="flex flex-row items-center justify-center gap-2 group/upload cursor-pointer" onClick={() => !isThisUploading && handleUploadClick(emp.id, type)}>
                          <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20 gap-1 pl-1 pr-1.5 py-0 h-5 transition-transform group-hover/upload:scale-105">
                            <XCircle className="h-2.5 w-2.5" /> Missing
                          </Badge>
                          <div className="h-6 flex items-center justify-center">
                            {isThisUploading ? (
                              <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
                            ) : (
                              <span className="text-[10px] font-medium text-primary opacity-0 group-hover/upload:opacity-100 transition-opacity flex items-center bg-primary/5 px-2 py-0.5 rounded-full">
                                <Upload className="h-2.5 w-2.5 mr-1" /> Upload
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    };

                    return (
                      <TableRow key={emp.id} className="hover:bg-muted/10 transition-colors border-b border-border/30 h-14">
                        <TableCell className="pl-4 py-2">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-7 w-7 border border-border shadow-sm">
                              <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">
                                {emp.name.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold text-foreground text-xs leading-tight">{emp.name}</p>
                              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{emp.rank}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-2 align-middle">
                          <div className="flex justify-center">{renderDocStatus(cnicDoc, 'CNIC', 'id_copy')}</div>
                        </TableCell>
                        <TableCell className="py-2 align-middle">
                          <div className="flex justify-center">{renderDocStatus(degreeDoc, 'Degree', 'certificate')}</div>
                        </TableCell>
                        <TableCell className="py-2 align-middle">
                          <div className="flex justify-center">{renderDocStatus(contractDoc, 'Contract', 'contract')}</div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  
                  {filteredEmployees.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                        No employees found matching your search.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog 
        open={!!viewDocument} 
        onOpenChange={(open) => {
          if (!open) {
            if (viewDocument?.url) URL.revokeObjectURL(viewDocument.url);
            setViewDocument(null);
          }
        }}
      >
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="p-4 border-b border-border/50 shrink-0">
            <DialogTitle className="text-lg">{viewDocument?.name}</DialogTitle>
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
    </DashboardLayout>
  );
}
