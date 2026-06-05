import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Send, MessageCircle, ShieldCheck } from "lucide-react";
import { format } from "date-fns";

export default function PortalChatTab() {
  const { employee, user } = useEmployeeAuth();
  const queryClient = useQueryClient();
  const [messageText, setMessageText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Get Admin profile for this company to send messages to
  const { data: adminProfile, isLoading: adminLoading } = useQuery({
    queryKey: ['company-admin', employee?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('employee_get_admin_id', {
        p_company_id: employee?.company_id
      });
      
      if (error) throw error;
      return { id: data };
    },
    enabled: !!employee?.company_id
  });

  const { data: messages, isLoading: messagesLoading } = useQuery({
    queryKey: ['portal-chat', employee?.id],
    queryFn: async () => {
      if (!employee?.id || !adminProfile?.id) return [];
      const { data, error } = await supabase.rpc('employee_get_chat', {
        p_emp_id: employee.id,
        p_admin_id: adminProfile.id
      });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!employee?.id && !!adminProfile?.id,
    refetchInterval: 3000
  });

  // Remove realtime subscription as it requires Supabase Auth.
  // We use refetchInterval in useQuery instead to poll for new messages safely.

  // Scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!employee?.company_id || !employee?.id || !adminProfile?.id || !messageText.trim()) return;
      
      const { error } = await supabase.rpc('employee_send_message', {
        p_company_id: employee.company_id,
        p_sender_id: employee.id,
        p_receiver_id: adminProfile.id,
        p_content: messageText.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-chat'] });
      setMessageText("");
    }
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    sendMutation.mutate();
  };

  if (adminLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex flex-col h-[70vh] min-h-[500px] border border-border/50 rounded-3xl bg-[#efeae2] overflow-hidden shadow-lg relative">
      {/* Header */}
      <div className="p-3 bg-[#00a884] flex items-center gap-3 shrink-0 z-10 shadow-sm">
        <div className="w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center">
          <ShieldCheck size={20} />
        </div>
        <div>
          <h3 className="font-bold text-white text-[15px] leading-tight">HR Department</h3>
          <p className="text-[11px] text-white/80 font-medium">Online</p>
        </div>
      </div>

      {/* Messages Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-3"
      >
        {messagesLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="animate-spin text-[#00a884]" /></div>
        ) : messages?.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2 bg-white/50 mx-4 rounded-2xl p-6 backdrop-blur-sm">
            <MessageCircle size={40} className="text-[#00a884]/40" />
            <p className="text-sm font-medium text-center">Send a message to HR. All conversations are secure and encrypted.</p>
          </div>
        ) : (
          messages?.map(msg => {
            const isMe = msg.sender_id === employee?.id;
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`relative max-w-[85%] px-3 py-1.5 shadow-sm ${
                  isMe 
                    ? 'bg-[#d9fdd3] text-[#111b21] rounded-2xl rounded-tr-sm' 
                    : 'bg-white text-[#111b21] rounded-2xl rounded-tl-sm'
                }`}>
                  <p className="text-[14.5px] leading-snug whitespace-pre-wrap pr-12 pb-1.5">{msg.content}</p>
                  <span className="text-[10px] text-slate-500 absolute bottom-1.5 right-2">
                    {format(new Date(msg.created_at), 'HH:mm')}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input Area */}
      <div className="p-3 bg-[#f0f2f5] shrink-0">
        <form onSubmit={handleSend} className="flex gap-2 items-end">
          <Input
            placeholder="Type a message"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            className="bg-white rounded-2xl border-0 focus-visible:ring-0 shadow-sm h-11 px-4 text-[15px]"
          />
          <Button 
            type="submit" 
            size="icon" 
            disabled={!messageText.trim() || sendMutation.isPending} 
            className="rounded-full h-11 w-11 shrink-0 bg-[#00a884] hover:bg-[#008f6f] text-white shadow-sm"
          >
            {sendMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} className="ml-0.5" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
