import AppLayout from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDownLeft, ArrowUpRight, Search, Filter } from "lucide-react";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { formatDistanceToNow, isToday, isYesterday } from "date-fns";

export default function History() {
  const [filter, setFilter] = useState("all");
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const data = await api.transactions.getAll();
        setTransactions(data);
      } catch (error) {
        console.error("Failed to fetch transactions", error);
      } finally {
        setLoading(false);
      }
    };
    fetchTransactions();
  }, []);

  return (
    <AppLayout>
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold">Transaction History</h1>
          <p className="text-muted-foreground">View and manage your past transactions.</p>
        </div>
        <div className="flex gap-2">
           <Button variant="outline" className="gap-2">
             <Filter className="h-4 w-4" /> Filter
           </Button>
           <Button variant="outline" className="gap-2">
             Export CSV
           </Button>
        </div>
      </header>

      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search transactions..." className="pl-10 bg-card" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No transactions yet
        </div>
      ) : (
        <div className="space-y-4">
          {["Today", "Yesterday", "This Month"].map((period) => {
            const periodTransactions = transactions.filter(t => {
              const date = new Date(t.createdAt);
              if (period === "Today") return isToday(date);
              if (period === "Yesterday") return isYesterday(date);
              return !isToday(date) && !isYesterday(date);
            });

            if (periodTransactions.length === 0) return null;

            return (
              <div key={period}>
                <h3 className="text-sm font-medium text-muted-foreground mb-3 sticky top-0 bg-background/95 backdrop-blur py-2 z-10">{period}</h3>
                <div className="space-y-2">
                  {periodTransactions.map((tx) => {
                    // Use direction from backend (primary) or fallback to type check
                    const isIncoming = tx.direction === 'incoming' || tx.type === 'received';

                    // Get display name: prefer description, then counterparty name
                    const displayName = tx.description ||
                      (tx.counterparty?.fullName ? (isIncoming ? `From ${tx.counterparty.fullName}` : `To ${tx.counterparty.fullName}`) : null) ||
                      tx.displayCategory ||
                      "Transaction";

                    return (
                      <div key={tx.id} className="flex items-center justify-between p-4 rounded-xl bg-card border border-border/50 hover:border-primary/20 transition-all group">
                        <div className="flex items-center gap-4">
                          <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                            isIncoming ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                          }`}>
                            {isIncoming ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{displayName}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{formatDistanceToNow(new Date(tx.createdAt), { addSuffix: true })}</span>
                              <span>•</span>
                              <span>{tx.displayCategory || tx.category || "Transaction"}</span>
                              {tx.counterparty?.username && (
                                <>
                                  <span>•</span>
                                  <span className="text-primary">@{tx.counterparty.username}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`font-bold ${
                            isIncoming ? 'text-green-600 dark:text-green-400' : 'text-foreground'
                          }`}>
                            {isIncoming ? '+' : '-'}₱{parseFloat(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </p>
                          <p className={`text-xs font-medium capitalize flex justify-end items-center gap-1 ${
                            tx.status === 'completed' ? 'text-green-600 dark:text-green-400' :
                            tx.status === 'pending' ? 'text-amber-500' :
                            tx.status === 'failed' || tx.status === 'refunded' ? 'text-red-500' : 'text-muted-foreground'
                          }`}>
                            {tx.status}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
}
