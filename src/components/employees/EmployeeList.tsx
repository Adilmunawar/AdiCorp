import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Edit, Trash2, User, Search, MoreHorizontal, Eye, Plus, ChevronLeft, ChevronRight, X, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { EmployeeRow } from "@/types/supabase";
import EmployeeImportExport from "./EmployeeImportExport";
import { useCurrency } from "@/hooks/useCurrency";

interface EmployeeListProps { onAddEmployee?: () => void; onEditEmployee?: (id: string) => void; }

export default function EmployeeList({ onAddEmployee, onEditEmployee }: EmployeeListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const { userProfile } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const ITEMS_PER_PAGE = 10;
  const { logEmployeeActivity } = useActivityLogger();
  const { currency } = useCurrency();

  useEffect(() => {
    setPage(1);
  }, [searchTerm]);

  const { data: employeeData, isLoading, error, refetch } = useQuery({
    queryKey: ['employees', userProfile?.company_id, searchTerm, page],
    queryFn: async () => {
      if (!userProfile?.company_id) return { rows: [], count: 0 };
      let query = supabase
        .from('employees')
        .select('*', { count: 'exact' })
        .eq('company_id', userProfile.company_id)
        .order('created_at', { ascending: false });

      if (searchTerm) query = query.ilike('name', `%${searchTerm}%`);

      const from = (page - 1) * ITEMS_PER_PAGE;
      query = query.range(from, from + ITEMS_PER_PAGE - 1);

      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data || [], count: count || 0 };
    },
    enabled: !!userProfile?.company_id,
  });

  const employees = employeeData?.rows || [];
  const totalCount = employeeData?.count || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));

  const handleDeleteEmployee = async (employee: EmployeeRow) => {
    if (!confirm(`Are you sure you want to delete ${employee.name}?`)) return;
    try {
      const { error } = await supabase.from('employees').delete().eq('id', employee.id);
      if (error) throw error;
      await logEmployeeActivity('delete', employee.name, { employee_id: employee.id, rank: employee.rank, wage_rate: employee.wage_rate, deleted_at: new Date().toISOString() });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success("Employee deleted successfully");
    } catch (error: any) { console.error("Error deleting employee:", error); toast.error("Failed to delete employee"); }
  };

  const formatCurrency = (amount: number) => {
    try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount); }
    catch { return `${currency || 'USD'} ${amount.toLocaleString()}`; }
  };

  const summary = useMemo(() => {
    const active = employees.filter((employee) => employee.status === 'active').length;
    const inactive = employees.length - active;
    const payroll = employees.reduce((sum, employee) => sum + Number(employee.wage_rate || 0), 0);
    return { active, inactive, payroll };
  }, [employees]);

  if (isLoading) {
    return (<div className="space-y-6"><Skeleton className="h-32 w-full rounded-3xl" /><Skeleton className="h-[500px] w-full rounded-3xl" /></div>);
  }

  if (error) { return (<Card className="border border-border bg-card"><CardContent className="p-6 text-center"><p className="text-destructive">Error loading employees</p></CardContent></Card>); }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Card className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden relative">
        {/* Subtle decorative background */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-10 pointer-events-none translate-x-1/2 -translate-y-1/2" />
        
        <CardHeader className="pb-4 pt-6 border-b border-border/40 bg-muted/10">
          <CardTitle className="flex items-center justify-between gap-4 flex-wrap relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-sm border border-primary/20">
                <User className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">Team Directory</p>
                <p className="text-sm font-medium text-muted-foreground">Manage your workforce profiles and schedules</p>
              </div>
            </div>

            {userProfile?.is_admin && (
              <div className="flex items-center gap-3">
                {onAddEmployee && (
                  <Button onClick={onAddEmployee} className="rounded-xl h-11 px-5 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all font-semibold">
                    <Plus className="h-5 w-5 mr-2" />
                    Onboard Employee
                  </Button>
                )}
              </div>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6 relative z-10">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
            <div className="rounded-xl border border-border/50 bg-background/50 p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Team Size</p>
              <div className="flex items-end gap-1.5 mt-1.5">
                <p className="text-2xl font-extrabold text-foreground">{totalCount}</p>
                <p className="text-xs text-muted-foreground mb-1 font-medium">members</p>
              </div>
            </div>
            <div className="rounded-xl border border-border/50 bg-background/50 p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status Split</p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mt-1.5">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500" /><span className="text-xs font-bold">{summary.active} Active</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-muted-foreground/50" /><span className="text-xs font-bold text-muted-foreground">{summary.inactive} Inactive</span></div>
              </div>
            </div>
            <div className="col-span-2 lg:col-span-1 rounded-xl border border-border/50 bg-background/50 p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Visible Payroll</p>
              <p className="text-xl font-extrabold text-primary mt-1.5 tracking-tight">{formatCurrency(summary.payroll)}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="search" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Search Directory</Label>
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4 group-focus-within:text-primary transition-colors" />
              <Input
                id="search"
                placeholder="Find someone by name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-9 rounded-xl h-10 bg-muted/10 border-border/50 focus:bg-background focus:ring-primary/20 shadow-sm text-sm"
              />
              {searchTerm && (
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 inline-flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  onClick={() => setSearchTerm("")}
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {userProfile?.is_admin && (
        <EmployeeImportExport onImportComplete={() => refetch()} employees={employees} />
      )}

      <Card className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {employees.length === 0 ? (
            <div className="p-12 text-center bg-muted/5 flex flex-col items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Search className="h-8 w-8 text-primary/60" />
              </div>
              <p className="text-xl font-bold text-foreground">No matching employees</p>
              <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
                {searchTerm ? "We couldn't find anyone matching that name. Try adjusting your search." : "Your directory is empty. Onboard your first team member to get started."}
              </p>
              {userProfile?.is_admin && onAddEmployee && !searchTerm && (
                <Button onClick={onAddEmployee} className="mt-6 rounded-xl h-11 px-6 shadow-sm">
                  <Plus className="h-5 w-5 mr-2" />
                  Onboard First Employee
                </Button>
              )}
            </div>
          ) : (
          <div className="overflow-x-auto w-full -mx-4 px-4 sm:mx-0 sm:px-0">
            <Table className="min-w-[600px]">
              <TableHeader className="bg-muted/30 border-b border-border/50">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[50px] pl-4 sm:pl-6 py-2.5 font-semibold text-xs">Avatar</TableHead>
                  <TableHead className="font-semibold py-2.5 text-xs">Employee Details</TableHead>
                  <TableHead className="font-semibold py-2.5 text-xs">Role</TableHead>
                  <TableHead className="font-semibold py-2.5 text-xs">Schedule</TableHead>
                  {userProfile?.is_admin && <TableHead className="font-semibold py-2.5 text-xs">Wage Rate</TableHead>}
                  <TableHead className="font-semibold py-2.5 text-xs">Status</TableHead>
                  <TableHead className="text-right pr-4 sm:pr-6 py-2.5 font-semibold text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((employee) => (
                  <TableRow key={employee.id} className="hover:bg-muted/10 transition-colors border-b border-border/30 group">
                    <TableCell className="pl-4 sm:pl-6 py-2">
                      <Avatar className="h-8 w-8 border-2 border-background shadow-sm group-hover:border-primary/20 transition-colors">
                        <AvatarFallback className="font-bold bg-primary/10 text-primary text-xs">
                          {employee.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex flex-col">
                        <span className="font-semibold text-foreground cursor-pointer text-sm hover:text-primary transition-colors" onClick={() => navigate(`/employees/${employee.id}`)}>
                          {employee.name}
                        </span>
                        {employee.email && <span className="text-[10px] text-muted-foreground">{employee.email}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge variant="outline" className="font-medium bg-background shadow-sm text-[10px] px-1.5 py-0">{employee.rank}</Badge>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex flex-col gap-0.5 items-start">
                        {employee.salary_divisor === 26 ? (
                          <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20"><Calendar className="h-2.5 w-2.5 mr-0.5"/> 6 Days / Week</Badge>
                        ) : employee.salary_divisor === 22 ? (
                          <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"><Calendar className="h-2.5 w-2.5 mr-0.5"/> 5 Days / Week</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground"><Calendar className="h-2.5 w-2.5 mr-0.5"/> Default</Badge>
                        )}
                        {employee.weekend_saturday !== null && (
                          <span className="text-[9px] text-muted-foreground italic flex items-center mt-0.5">
                            {employee.weekend_saturday ? "Saturday OFF" : "Saturday ON"}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    {userProfile?.is_admin && (
                      <TableCell className="py-2 font-bold text-foreground text-xs">
                        {formatCurrency(employee.wage_rate)}
                      </TableCell>
                    )}
                    <TableCell className="py-2">
                      <Badge variant={employee.status === 'active' ? 'default' : 'secondary'} className="capitalize shadow-sm font-semibold text-[10px] px-1.5 py-0">
                        {employee.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right pr-4 sm:pr-6 py-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-7 w-7 p-0 rounded-lg hover:bg-primary/10 hover:text-primary transition-colors">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40 rounded-xl shadow-xl">
                          <DropdownMenuLabel className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Actions</DropdownMenuLabel>
                          <DropdownMenuItem className="cursor-pointer font-medium py-1.5 rounded-md my-0.5 text-xs" onClick={() => navigate(`/employees/${employee.id}`)}>
                            <Eye className="mr-2 h-3.5 w-3.5" /> View Profile
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {userProfile?.is_admin && (
                            <DropdownMenuItem className="cursor-pointer font-medium py-1.5 rounded-md my-0.5 text-xs" onClick={() => onEditEmployee?.(employee.id)}>
                              <Edit className="mr-2 h-3.5 w-3.5" /> Edit Details
                            </DropdownMenuItem>
                          )}
                          {userProfile?.is_admin && (
                            <DropdownMenuItem className="cursor-pointer font-medium py-1.5 rounded-md my-0.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 focus:text-destructive focus:bg-destructive/10" onClick={() => handleDeleteEmployee(employee)}>
                              <Trash2 className="mr-2 h-3.5 w-3.5" /> Remove
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          )}
        </CardContent>
      </Card>

      {totalCount > ITEMS_PER_PAGE && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/50 bg-background px-5 py-3 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">
            Page <span className="font-bold text-foreground mx-0.5">{page}</span> of <span className="font-bold text-foreground mx-0.5">{totalPages}</span>
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl h-9 hover:bg-primary/5 hover:text-primary transition-colors font-semibold"
              disabled={page === 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl h-9 hover:bg-primary/5 hover:text-primary transition-colors font-semibold"
              disabled={page >= totalPages}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
