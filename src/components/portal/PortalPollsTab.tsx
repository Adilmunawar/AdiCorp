import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { BarChart2, Loader2, CheckCircle2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export default function PortalPollsTab() {
  const { employee } = useEmployeeAuth();
  const queryClient = useQueryClient();

  const { data: polls, isLoading } = useQuery({
    queryKey: ['portal-polls', employee?.company_id, employee?.id],
    queryFn: async () => {
      // Fetch active polls
      const { data: pollsData, error: pollsError } = await supabase
        .from('polls')
        .select('*')
        .eq('company_id', employee?.company_id)
        .order('created_at', { ascending: false });
      
      if (pollsError) throw pollsError;
      if (!pollsData || pollsData.length === 0) return [];

      const pollIds = pollsData.map(p => p.id);

      const { data: optionsData } = await supabase.from('poll_options').select('*').in('poll_id', pollIds);
      const { data: votesData } = await supabase.from('poll_votes').select('*').in('poll_id', pollIds);

      return pollsData.map(poll => {
        const pollOpts = optionsData?.filter(o => o.poll_id === poll.id) || [];
        const pollVotes = votesData?.filter(v => v.poll_id === poll.id) || [];
        const totalVotes = pollVotes.length;
        const myVote = pollVotes.find(v => v.employee_id === employee?.id);

        return {
          ...poll,
          options: pollOpts.map(opt => {
            const votesForOption = pollVotes.filter(v => v.option_id === opt.id).length;
            return {
              ...opt,
              voteCount: votesForOption,
              percentage: totalVotes > 0 ? Math.round((votesForOption / totalVotes) * 100) : 0
            };
          }),
          totalVotes,
          hasVoted: !!myVote,
          myVoteOptionId: myVote?.option_id
        };
      });
    },
    enabled: !!employee?.company_id && !!employee?.id
  });

  const voteMutation = useMutation({
    mutationFn: async ({ pollId, optionId }: { pollId: string, optionId: string }) => {
      if (!employee?.id) throw new Error("Not logged in");
      const { error } = await supabase.from('poll_votes').insert({
        poll_id: pollId,
        option_id: optionId,
        employee_id: employee.id
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-polls'] });
      toast.success("Vote submitted successfully!");
    },
    onError: (err: any) => toast.error("Failed to submit vote")
  });

  if (isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      {polls?.length === 0 ? (
        <div className="text-center py-12 text-slate-400 bg-white rounded-2xl border border-dashed shadow-sm">
          <BarChart2 className="mx-auto mb-3 opacity-30" size={32} />
          <p className="text-sm font-medium">No polls available right now</p>
        </div>
      ) : (
        polls?.map(poll => (
          <Card key={poll.id} className={`border-0 shadow-md ${poll.status === 'closed' ? 'opacity-80' : ''}`}>
            <CardHeader className="pb-3">
              <CardTitle className="text-[15px] leading-tight text-slate-800">{poll.question}</CardTitle>
              <CardDescription className="text-xs mt-1">
                {poll.status === 'active' ? 'Active Poll' : 'Closed Poll'} • {poll.totalVotes} votes total
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {poll.options.map(opt => {
                const isMyVote = poll.myVoteOptionId === opt.id;
                
                // If they haven't voted and poll is active, show buttons
                if (!poll.hasVoted && poll.status === 'active') {
                  return (
                    <Button 
                      key={opt.id} 
                      variant="outline" 
                      className="w-full justify-start h-auto py-3 px-4 text-left whitespace-normal font-normal border-slate-200 hover:border-purple-300 hover:bg-purple-50 transition-colors"
                      onClick={() => voteMutation.mutate({ pollId: poll.id, optionId: opt.id })}
                      disabled={voteMutation.isPending}
                    >
                      {opt.option_text}
                    </Button>
                  );
                }

                // If they have voted or poll is closed, show results
                return (
                  <div key={opt.id} className={`relative overflow-hidden rounded-xl border p-3 ${isMyVote ? 'border-purple-200 bg-purple-50/50' : 'border-slate-100 bg-slate-50/50'}`}>
                    <div className="flex justify-between text-xs mb-2 relative z-10">
                      <span className={`font-medium flex items-center gap-1.5 ${isMyVote ? 'text-purple-700' : 'text-slate-700'}`}>
                        {opt.option_text}
                        {isMyVote && <CheckCircle2 size={14} className="text-purple-500" />}
                      </span>
                      <span className="text-slate-500 font-semibold">{opt.percentage}%</span>
                    </div>
                    <Progress 
                      value={opt.percentage} 
                      className={`h-1.5 ${isMyVote ? 'bg-purple-100' : 'bg-slate-100'}`} 
                      indicatorClassName={isMyVote ? "bg-purple-500" : "bg-slate-400"} 
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
