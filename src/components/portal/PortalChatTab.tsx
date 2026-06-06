import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Send, MessageCircle, ShieldCheck } from "lucide-react";
import { format } from "date-fns";

export default function PortalChatTab() {
  const { employee } = useEmployeeAuth();
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

  // Mark messages as read and scroll to bottom
  useEffect(() => {
    if (messages && messages.length > 0 && adminProfile?.id && employee?.id) {
      // Mark as read via RPC
      const hasUnreadFromAdmin = messages.some((m: any) => m.sender_id === adminProfile.id && !m.is_read);
      if (hasUnreadFromAdmin) {
        supabase.rpc('employee_mark_chat_read', {
          p_emp_id: employee.id,
          p_sender_id: adminProfile.id
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ['portal-unread-counts'] });
          queryClient.invalidateQueries({ queryKey: ['portal-chat'] });
        });
      }
    }

    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, adminProfile?.id, employee?.id, queryClient]);

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
    <div className="flex flex-col h-[calc(100vh-220px)] sm:h-[70vh] sm:min-h-[500px] border border-border/50 rounded-2xl sm:rounded-3xl bg-slate-50 overflow-hidden shadow-lg relative">
      {/* Header */}
      <div className="p-3 bg-primary flex items-center gap-3 shrink-0 z-10 shadow-sm">
        <div className="w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center backdrop-blur-sm shadow-sm">
          <ShieldCheck size={20} />
        </div>
        <div>
          <h3 className="font-bold text-white text-[15px] sm:text-[16px] leading-tight">HR Department</h3>
          <p className="text-[11px] sm:text-[12px] text-white/90 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse"></span>
            Online
          </p>
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
                  messages?.map((msg, index) => {
            const isMe = msg.sender_id === employee?.id;
            // Add a small tail to the first message in a group
            const isFirstInGroup = index === 0 || messages[index - 1]?.sender_id !== msg.sender_id;
            
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`relative max-w-[85%] sm:max-w-[75%] px-3 py-1.5 shadow-sm transition-all ${
                  isMe 
                    ? `bg-primary text-primary-foreground rounded-2xl ${isFirstInGroup ? 'rounded-tr-sm' : ''}` 
                    : `bg-white text-slate-800 rounded-2xl border border-slate-100 ${isFirstInGroup ? 'rounded-tl-sm' : ''}`
                }`}>
                  {/* Message Tail SVG */}
                  {isFirstInGroup && isMe && (
                    <svg viewBox="0 0 8 13" width="8" height="13" className="absolute top-0 -right-[7px] text-primary">
                      <path opacity=".13" fill="#0000000" d="M1.533 3.118L8 12.114V1.913a1.914 1.914 0 0 0-1.913-1.913H.123c-1.393 0-2.035 1.745-.98 2.668l2.39 2.45z"></path>
                      <path fill="currentColor" d="M1.533 2.568L8 11.564V1.363a1.364 1.364 0 0 0-1.363-1.363H.123c-1.393 0-2.035 1.745-.98 2.668l2.39 2.45z"></path>
                    </svg>
                  )}
                  {isFirstInGroup && !isMe && (
                    <svg viewBox="0 0 8 13" width="8" height="13" className="absolute top-0 -left-[7px] text-white transform -scale-x-100">
                      <path opacity=".13" fill="#0000000" d="M1.533 3.118L8 12.114V1.913a1.914 1.914 0 0 0-1.913-1.913H.123c-1.393 0-2.035 1.745-.98 2.668l2.39 2.45z"></path>
                      <path fill="currentColor" d="M1.533 2.568L8 11.564V1.363a1.364 1.364 0 0 0-1.363-1.363H.123c-1.393 0-2.035 1.745-.98 2.668l2.39 2.45z"></path>
                    </svg>
                  )}
                  
                  <p className="text-[14.5px] leading-snug whitespace-pre-wrap pr-16 pb-2 break-words">{msg.content}</p>
                  <div className="absolute bottom-1 right-2 flex items-center gap-1">
                    <span className={`text-[10px] leading-none select-none ${isMe ? 'text-primary-foreground/80' : 'text-slate-500'}`}>
                      {format(new Date(msg.created_at), 'HH:mm')}
                    </span>
                    {isMe && (
                      <span className={`text-[14px] leading-none select-none ${msg.is_read ? 'text-blue-200' : 'text-primary-foreground/50'}`}>
                        ✓✓
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input Area */}
      <div className="p-3 bg-white shrink-0 border-t border-border/40">
        <form onSubmit={handleSend} className="flex gap-2 items-end">
          <Input
            placeholder="Type a message"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            className="bg-slate-50 rounded-2xl border-slate-200 focus-visible:ring-0 shadow-none h-11 px-4 text-[15px]"
          />
          <Button 
            type="submit" 
            size="icon" 
            disabled={!messageText.trim() || sendMutation.isPending} 
            className="rounded-full h-11 w-11 shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
          >
            {sendMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} className="ml-0.5" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
