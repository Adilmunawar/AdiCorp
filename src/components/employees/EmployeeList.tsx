
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Edit, Trash2, User, Search, MoreHorizontal, Mail, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { EmployeeRow } from "@/types/supabase";
import EmployeeImportExport from "./EmployeeImportExport";
import { useCurrency } from "@/hooks/useCurrency";

interface EmployeeListProps {
  onAddEmployee?: () => void;
  onEditEmployee?: (id: string) => void;
}

export default function EmployeeList({ onAddEmployee, onEditEmployee }: EmployeeListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const { userProfile } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const ITEMS_PER_PAGE = 10;
  const { logEmployeeActivity } = useActivityLogger();
  const { currency } = useCurrency();

  const { data: employees, isLoading, error, refetch } = useQuery({
    queryKey: ['employees', userProfile?.company_id, searchTerm, page],
    queryFn: async () => {
      if (!userProfile?.company_id) return [];

      let query = supabase
        .from('employees')
        .select('*')
        .eq('company_id', userProfile.company_id)
        .order('created_at', { ascending: false });

      if (searchTerm) {
        query = query.ilike('name', `%${searchTerm}%`);
      }

      const from = (page - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      query = query.range(from, to);

      const { data, error } = await query;
      if (error) throw error;

      return data || [];
    },
    enabled: !!userProfile?.company_id,
  });

  const handleDeleteEmployee = async (employee: EmployeeRow) => {
    if (!confirm(`Are you sure you want to delete ${employee.name}?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('employees')
        .delete()
        .eq('id', employee.id);

      if (error) throw error;

      await logEmployeeActivity('delete', employee.name, {
        employee_id: employee.id,
        rank: employee.rank,
        wage_rate: employee.wage_rate,
        deleted_at: new Date().toISOString()
      });

      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success("Employee deleted successfully");
    } catch (error: any) {
      console.error("Error deleting employee:", error);
      toast.error("Failed to delete employee");
    }
  };

  const handleImportComplete = () => {
    refetch();
  };

  const formatCurrency = (amount: number) => {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(amount);
    } catch (error) {
      return `${currency || 'USD'} ${amount.toLocaleString()}`;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <Card key={i} className="glass-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-4 w-20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="glass-card">
        <CardContent className="p-6 text-center">
          <p className="text-red-400">Error loading employees</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add Employee Button - Admin Only */}
      {userProfile?.is_admin && (
        <>
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center">
                  <User className="mr-2 h-5 w-5 text-adicorp-purple" />
                  Admin Actions
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {onAddEmployee && (
                <Button 
                  onClick={onAddEmployee}
                  className="w-full bg-adicorp-purple hover:bg-adicorp-purple-dark btn-glow"
                  size="lg"
                >
                  Add New Employee
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Import/Export Section - Admin Only */}
          <EmployeeImportExport 
            onImportComplete={handleImportComplete}
            employees={employees || []}
          />
        </>
      )}

      {/* Employee List */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center">
            <User className="mr-2 h-5 w-5 text-adicorp-purple" />
            Employee List ({employees?.length || 0} employees)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Label htmlFor="search">Search Employees</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50 h-4 w-4" />
              <Input
                id="search"
                placeholder="Search by name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-adicorp-dark border-white/20 text-white"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
               <TableHeader>
                 <TableRow>
                   <TableHead className="w-[50px]">Avatar</TableHead>
                   <TableHead>Name</TableHead>
                   <TableHead>Rank</TableHead>
                   {userProfile?.is_admin && <TableHead>Wage Rate</TableHead>}
                   <TableHead>Status</TableHead>
                   <TableHead className="text-right">Actions</TableHead>
                 </TableRow>
               </TableHeader>
              <TableBody>
                {employees?.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell>
                      <Avatar>
                        <AvatarFallback>{employee.name.charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>
                    </TableCell>
                     <TableCell 
                       className="font-medium text-primary hover:underline cursor-pointer"
                       onClick={() => navigate(`/employees/${employee.id}`)}
                     >
                       {employee.name}
                     </TableCell>
                     <TableCell>
                       <Badge variant="secondary">{employee.rank}</Badge>
                     </TableCell>
                     {userProfile?.is_admin && <TableCell>{formatCurrency(employee.wage_rate)}</TableCell>}
                     <TableCell>
                      <Badge variant={employee.status === 'active' ? 'default' : 'destructive'}>
                        {employee.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => navigate(`/employees/${employee.id}`)}>
                            <Eye className="mr-2 h-4 w-4" />
                            <span>View Profile</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                           {userProfile?.is_admin && (
                             <DropdownMenuItem onClick={() => onEditEmployee?.(employee.id)}>
                               <Edit className="mr-2 h-4 w-4" />
                               <span>Edit</span>
                             </DropdownMenuItem>
                           )}
                           {userProfile?.is_admin && (
                             <DropdownMenuItem onClick={() => handleDeleteEmployee(employee)}>
                               <Trash2 className="mr-2 h-4 w-4" />
                               <span>Delete</span>
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
        </CardContent>
      </Card>
      {employees && employees.length === ITEMS_PER_PAGE && (
        <div className="flex justify-center">
          <Button
            onClick={() => setPage(page + 1)}
            variant="outline"
            className="border-white/20 text-white hover:bg-white/10"
          >
            Load More
          </Button>
        </div>
      )}
    </div>
  );
}
