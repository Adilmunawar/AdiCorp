import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import DashboardLayout from "@/components/layout/Dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Download, AlertCircle, CheckCircle2, XCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function DocumentTracking() {
  const { userProfile } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");

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

  const handleDownload = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage.from("employee-documents").download(filePath);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url; a.download = fileName; a.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast.error(`Download failed: ${error.message}`);
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

  const filteredEmployees = employees.filter(emp => 
    emp.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getDocForEmployee = (empId: string, type: string) => {
    return documents.find(d => d.employee_id === empId && d.document_type === type);
  };

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
            <div className="relative max-w-sm w-full">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground h-3.5 w-3.5" />
              <Input
                placeholder="Search employees..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 rounded-lg h-8 text-xs bg-background border-border/50"
              />
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

                    const renderDocStatus = (doc: any, label: string) => {
                      if (doc) {
                        return (
                          <div className="flex flex-col items-center gap-1.5">
                            <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-700 border-green-500/20 gap-1 pl-1 pr-1.5 py-0 h-5">
                              <CheckCircle2 className="h-2.5 w-2.5" /> Uploaded
                            </Badge>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-6 text-[10px] text-primary hover:bg-primary/10 px-2"
                              onClick={() => handleDownload(doc.file_path, doc.file_name)}
                            >
                              <Download className="h-3 w-3 mr-1" /> View
                            </Button>
                          </div>
                        );
                      }
                      return (
                        <div className="flex flex-col items-center">
                          <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20 gap-1 pl-1 pr-1.5 py-0 h-5">
                            <XCircle className="h-2.5 w-2.5" /> Missing
                          </Badge>
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
                          <div className="flex justify-center">{renderDocStatus(cnicDoc, 'CNIC')}</div>
                        </TableCell>
                        <TableCell className="py-2 align-middle">
                          <div className="flex justify-center">{renderDocStatus(degreeDoc, 'Degree')}</div>
                        </TableCell>
                        <TableCell className="py-2 align-middle">
                          <div className="flex justify-center">{renderDocStatus(contractDoc, 'Contract')}</div>
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
    </DashboardLayout>
  );
}
