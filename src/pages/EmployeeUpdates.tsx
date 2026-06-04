import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Dashboard from "@/components/layout/Dashboard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Check, X, UserCog, Clock, Loader2, Search, ArrowRight, CheckCircle2, XCircle } from "lucide-react";
import { format, parseISO } from "date-fns";

export default function EmployeeUpdates() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("pending");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: requests, isLoading } = useQuery({
    queryKey: ["employee_update_requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_update_requests")
        .select(`
          id,
          requested_changes,
          status,
          created_at,
          reviewed_at,
          employee_id,
          employees (name, rank, cnic, phone, emergency_contact, bank_name, bank_account_number, date_of_birth, education)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const processMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const { error } = await supabase.rpc("process_update_request", {
        p_req_id: id,
        p_status: status
      });
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["employee_update_requests"] });
      toast.success(`Request ${variables.status} successfully`);
    },
    onError: (error: any) => {
      toast.error(`Failed to process request: ${error.message}`);
    }
  });

  // Filter requests by tab and search query
  const filteredRequests = useMemo(() => {
    if (!requests) return [];
    return requests.filter((req: any) => {
      const matchesTab = req.status === activeTab;
      const matchesSearch = req.employees?.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            req.employees?.cnic?.includes(searchQuery);
      return matchesTab && matchesSearch;
    });
  }, [requests, activeTab, searchQuery]);

  // Tab counts
  const pendingCount = requests?.filter((r: any) => r.status === 'pending').length || 0;

  if (isLoading) {
    return (
      <Dashboard title="Employee Updates">
        <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      </Dashboard>
    );
  }

  const renderDiff = (key: string, newValue: any, employeeData: any) => {
    const oldValue = employeeData?.[key] || 'Not Set';
    const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    return (
      <div key={key} className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm bg-white border border-border/50 rounded-md p-2">
        <span className="font-semibold text-muted-foreground w-1/3 shrink-0">{formattedKey}</span>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="truncate text-muted-foreground line-through decoration-destructive/50">{String(oldValue)}</span>
          <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="truncate font-medium text-primary">{String(newValue)}</span>
        </div>
      </div>
    );
  };

  const renderRequestCard = (req: any) => (
    <Card key={req.id} className="overflow-hidden border-muted">
      <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4 flex-1">
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg shrink-0">
            {req.employees?.name?.substring(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-bold text-foreground truncate">{req.employees?.name}</h3>
              {req.status === 'approved' && <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-0">Approved</Badge>}
              {req.status === 'rejected' && <Badge variant="destructive" className="bg-destructive/10 text-destructive hover:bg-destructive/20 border-0">Rejected</Badge>}
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              {req.employees?.rank} • {req.employees?.cnic}
            </p>
            
            <div className="bg-muted/40 rounded-lg p-4 border border-border/50">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Requested Changes</p>
              <div className="space-y-2">
                {Object.entries(req.requested_changes).map(([key, value]) => 
                  renderDiff(key, value, req.employees)
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-4 mt-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> 
                Requested: {format(parseISO(req.created_at), 'MMM d, yyyy h:mm a')}
              </p>
              {req.reviewed_at && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 border-l border-border pl-4">
                  {req.status === 'approved' ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <XCircle className="w-3.5 h-3.5 text-destructive" />}
                  Reviewed: {format(parseISO(req.reviewed_at), 'MMM d, yyyy h:mm a')}
                </p>
              )}
            </div>
          </div>
        </div>

        {req.status === 'pending' && (
          <div className="flex flex-row md:flex-col gap-2 shrink-0 border-t md:border-t-0 pt-4 md:pt-0 pl-0 md:pl-4 md:border-l border-border/50">
            <Button 
              className="flex-1 bg-green-500 hover:bg-green-600 text-white shadow-sm"
              onClick={() => processMutation.mutate({ id: req.id, status: "approved" })}
              disabled={processMutation.isPending}
            >
              <Check className="w-4 h-4 mr-2" /> Approve
            </Button>
            <Button 
              variant="outline"
              className="flex-1 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => processMutation.mutate({ id: req.id, status: "rejected" })}
              disabled={processMutation.isPending}
            >
              <X className="w-4 h-4 mr-2" /> Reject
            </Button>
          </div>
        )}
      </div>
    </Card>
  );

  return (
    <Dashboard title="Employee Updates">
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Employee Updates</h1>
            <p className="text-sm text-muted-foreground">Review and manage profile change requests.</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by name or CNIC..."
              className="pl-9 bg-background"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <Tabs defaultValue="pending" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 max-w-[400px]">
            <TabsTrigger value="pending" className="relative">
              Pending
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white">
                  {pendingCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
          </TabsList>
          
          <div className="mt-6">
            <TabsContent value={activeTab} className="m-0 focus-visible:outline-none">
              {filteredRequests.length === 0 ? (
                <Card className="border-dashed border-2 bg-muted/10">
                  <CardContent className="p-12 text-center text-muted-foreground flex flex-col items-center gap-3">
                    <UserCog className="w-12 h-12 opacity-20" />
                    <p className="text-lg font-medium">
                      {searchQuery ? "No matching requests found" : `No ${activeTab} requests`}
                    </p>
                    <p className="text-sm">
                      {searchQuery 
                        ? "Try adjusting your search terms." 
                        : activeTab === 'pending' 
                          ? "Employees haven't submitted any new profile updates."
                          : `There are no historically ${activeTab} requests.`}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {filteredRequests.map(renderRequestCard)}
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </Dashboard>
  );
}
