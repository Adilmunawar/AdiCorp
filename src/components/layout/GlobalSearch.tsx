import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Search, Users, Calendar, Settings, DollarSign, Clock, TrendingUp, Loader2, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { startOfDay, formatDistanceToNow } from "date-fns";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

interface SearchResult {
  id: string;
  title: string;
  subtitle?: string;
  type: 'employee' | 'page' | 'feature';
  action: () => void;
  icon: React.ComponentType<any>;
}

// ---------------------------------------------------------------------------
// Mini Components for the Analytics Sidebar
// ---------------------------------------------------------------------------

function SearchAnalytics({ companyId }: { companyId: string }) {
  const { data: analytics, isLoading } = useQuery({
    queryKey: ['search-analytics', companyId],
    queryFn: async () => {
      const today = startOfDay(new Date()).toISOString().split('T')[0];

      // 1. Fetch today's attendance
      const { data: attendanceData } = await supabase
        .from('attendance')
        .select(`id, status, employees!inner(company_id)`)
        .eq('employees.company_id', companyId)
        .eq('date', today);

      // 2. Fetch active employees & wages
      const { data: employeesData } = await supabase
        .from('employees')
        .select('id, rank, wage_rate, status')
        .eq('company_id', companyId)
        .eq('status', 'active');

      // 3. Fetch recent "activity" (mocked by recent employees/attendance)
      const { data: recentEmployees } = await supabase
        .from('employees')
        .select('id, name, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(2);

      const totalEmployees = employeesData?.length || 0;
      const presentCount = attendanceData?.filter(a => a.status === 'present').length || 0;
      const attendanceRate = totalEmployees > 0 ? Math.round((presentCount / totalEmployees) * 100) : 0;

      const pieData = [
        { name: 'Present', value: presentCount, color: 'hsl(142, 76%, 36%)' }, // green
        { name: 'Absent/Leave', value: totalEmployees - presentCount, color: 'hsl(var(--muted))' }
      ];

      const salaryByRank = employeesData?.reduce((acc: any, emp) => {
        const rank = emp.rank || 'Unassigned';
        if (!acc[rank]) acc[rank] = { rank, totalWage: 0, count: 0 };
        acc[rank].totalWage += Number(emp.wage_rate || 0);
        acc[rank].count += 1;
        return acc;
      }, {});

      const barData = Object.values(salaryByRank || {})
        .map((item: any) => ({
          rank: item.rank,
          avgWage: Math.round(item.totalWage / item.count)
        }))
        .sort((a, b) => b.avgWage - a.avgWage)
        .slice(0, 4);

      const recentActivity = (recentEmployees || []).map(e => ({
        id: e.id,
        title: 'New Hire',
        desc: e.name || 'Unnamed Employee',
        time: new Date(e.created_at || new Date())
      }));

      return { attendanceRate, pieData, barData, recentActivity };
    },
    enabled: !!companyId,
    staleTime: 60000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  if (!analytics) return null;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      {/* Attendance Circular Graph */}
      <div>
        <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          Today's Attendance
        </h3>
        <div className="relative h-32 flex items-center justify-center bg-card/50 rounded-xl border border-border/40 p-2 shadow-sm">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={analytics.pieData}
                cx="50%"
                cy="50%"
                innerRadius={35}
                outerRadius={45}
                startAngle={90}
                endAngle={-270}
                dataKey="value"
                stroke="none"
              >
                {analytics.pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-xl font-bold text-foreground">{analytics.attendanceRate}%</span>
          </div>
        </div>
      </div>

      {/* Wage Distribution Bar Graph */}
      <div>
        <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <DollarSign className="w-3.5 h-3.5" />
          Avg Wage by Rank
        </h3>
        <div className="h-32 bg-card/50 rounded-xl border border-border/40 p-3 shadow-sm">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics.barData} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
              <XAxis dataKey="rank" fontSize={9} tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" />
              <YAxis fontSize={9} tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                cursor={{ fill: 'hsl(var(--muted)/0.4)' }}
                contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))', fontSize: '11px', padding: '4px 8px' }}
              />
              <Bar dataKey="avgWage" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Activity Mini-Feed */}
      <div>
        <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5" />
          Recent Events
        </h3>
        <div className="space-y-2">
          {analytics.recentActivity.map((activity) => (
            <div key={activity.id} className="flex items-start gap-2.5 p-2 rounded-lg bg-card/40 border border-border/30">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Users className="w-3 h-3 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-foreground truncate">{activity.title}</p>
                <p className="text-[10px] text-muted-foreground truncate">{activity.desc}</p>
                <p className="text-[9px] text-muted-foreground/60 mt-0.5">{formatDistanceToNow(activity.time, { addSuffix: true })}</p>
              </div>
            </div>
          ))}
          {analytics.recentActivity.length === 0 && (
            <p className="text-[10px] text-muted-foreground text-center py-2">No recent events.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const fetchEmployees = useCallback(async (query: string = "") => {
    if (!userProfile?.company_id) return;
    setLoading(true);
    try {
      let q = supabase
        .from('employees')
        .select('id, name, rank, status')
        .eq('company_id', userProfile.company_id)
        .eq('status', 'active')
        .limit(8);
        
      if (query) {
        q = q.ilike('name', `%${query}%`);
      }
      
      const { data, error } = await q;
      if (error) throw error;
      setEmployees(data || []);
    } catch {
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }, [userProfile?.company_id]);

  useEffect(() => {
    if (open) fetchEmployees(debouncedQuery);
  }, [open, debouncedQuery, fetchEmployees]);

  const navigationItems: SearchResult[] = useMemo(() => [
    { id: 'dashboard', title: 'Dashboard', subtitle: 'Overview and statistics', type: 'page', action: () => navigate('/dashboard'), icon: TrendingUp },
    { id: 'employees', title: 'Employees', subtitle: 'Manage employee data', type: 'page', action: () => navigate('/employees'), icon: Users },
    { id: 'attendance', title: 'Attendance', subtitle: 'Track daily attendance', type: 'page', action: () => navigate('/attendance'), icon: Clock },
    { id: 'salary', title: 'Salary Management', subtitle: 'Calculate and manage payroll', type: 'page', action: () => navigate('/salary'), icon: DollarSign },
    { id: 'events', title: 'Events & Holidays', subtitle: 'Manage company events', type: 'page', action: () => navigate('/events'), icon: Calendar },
    { id: 'working-days', title: 'Shift Management', subtitle: 'Configure work schedules', type: 'page', action: () => navigate('/working-days'), icon: Calendar },
    { id: 'settings', title: 'Settings', subtitle: 'Application preferences', type: 'page', action: () => navigate('/settings'), icon: Settings },
  ], [navigate]);

  const employeeResults: SearchResult[] = useMemo(() => {
    return employees.map(emp => ({
      id: emp.id,
      title: emp.name?.trim() || 'Unnamed',
      subtitle: emp.rank || 'Employee',
      type: 'employee' as const,
      action: () => navigate(`/employees?search=${emp.name}`),
      icon: Users
    }));
  }, [employees, navigate]);

  const filteredNavigationItems = useMemo(() => {
    if (!debouncedQuery) return navigationItems;
    return navigationItems.filter(item => 
      item.title.toLowerCase().includes(debouncedQuery.toLowerCase()) || 
      item.subtitle?.toLowerCase().includes(debouncedQuery.toLowerCase())
    );
  }, [navigationItems, debouncedQuery]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setSearchQuery("");
    setDebouncedQuery("");
  }, []);

  const handleSelect = useCallback((action: () => void) => {
    action();
    handleClose();
  }, [handleClose]);

  return (
    <>
      <Button 
        variant="outline" 
        className="relative w-48 md:w-64 justify-start text-sm text-muted-foreground border-border/50 hover:border-primary/30 hover:bg-card/50 transition-all duration-300 shadow-sm rounded-xl h-9" 
        onClick={() => setOpen(true)}
      >
        <Search className="mr-2 h-4 w-4 text-primary/70" />
        <span className="hidden sm:inline">Search command center...</span>
        <span className="sm:hidden">Search...</span>
        <kbd className="pointer-events-none absolute right-2 top-2 hidden h-5 select-none items-center gap-1 rounded bg-muted/50 px-1.5 font-mono text-[10px] font-medium text-muted-foreground border border-border/50 md:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0 max-w-4xl shadow-2xl border-border/50 bg-card/95 backdrop-blur-xl sm:rounded-2xl">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_260px] h-[80vh] md:h-[600px] max-h-[800px]">
            
            {/* Left Column: Search & Results */}
            <div className="flex flex-col h-full overflow-hidden border-r border-border/30">
              <Command className="flex flex-col h-full bg-transparent" shouldFilter={false}>
                <div className="border-b border-border/30 px-3">
                  <CommandInput 
                    placeholder="Search employees, pages, or features..." 
                    value={searchQuery} 
                    onValueChange={setSearchQuery} 
                    className="h-14 text-base border-none focus:ring-0"
                  />
                </div>
                
                <CommandList className="flex-1 overflow-y-auto p-2 scrollbar-thin">
                  <CommandEmpty className="py-12 text-center">
                    {loading ? (
                      <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        <span className="text-sm">Searching records...</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                        <Search className="h-8 w-8 opacity-20 mb-2" />
                        <span className="text-sm">No results found for "{searchQuery}".</span>
                      </div>
                    )}
                  </CommandEmpty>

                  {filteredNavigationItems.length > 0 && (
                    <CommandGroup heading="Quick Navigation" className="mb-2">
                      {filteredNavigationItems.map((item) => (
                        <CommandItem 
                          key={item.id} 
                          onSelect={() => handleSelect(item.action)} 
                          className="cursor-pointer mb-1 rounded-xl aria-selected:bg-primary/10 aria-selected:text-primary transition-all duration-200"
                        >
                          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center mr-3 shrink-0 group-aria-selected:bg-primary/20">
                            <item.icon className="h-4 w-4 text-foreground/70" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm truncate">{item.title}</div>
                            <div className="text-xs text-muted-foreground truncate">{item.subtitle}</div>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  {employeeResults.length > 0 && (
                    <CommandGroup heading="Employees Database">
                      {employeeResults.map((item) => (
                        <CommandItem 
                          key={item.id} 
                          onSelect={() => handleSelect(item.action)} 
                          className="cursor-pointer mb-1 rounded-xl aria-selected:bg-green-500/10 aria-selected:text-green-600 transition-all duration-200"
                        >
                          <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center mr-3 shrink-0">
                            <Users className="h-4 w-4 text-green-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm truncate">{item.title}</div>
                            <div className="text-xs text-muted-foreground truncate">{item.subtitle}</div>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </div>

            {/* Right Column: Quick Analytics */}
            <div className="hidden md:block bg-muted/10 h-full overflow-y-auto scrollbar-hide p-5">
              <div className="mb-6">
                <h2 className="text-sm font-bold text-foreground">Command Center</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">Live workspace analytics</p>
              </div>
              
              {userProfile?.company_id && (
                <SearchAnalytics companyId={userProfile.company_id} />
              )}
            </div>
            
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
