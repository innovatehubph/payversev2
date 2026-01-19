/**
 * FAQ Hook - Fetches and manages FAQ data from the AI learning system
 */

import { useState, useEffect, useCallback } from "react";
import { getAuthToken } from "@/lib/api";

export interface FAQ {
  id: number;
  question: string;
  answer: string;
  category: string;
  hitCount: number;
  priority: number;
}

interface FAQResponse {
  faqs: FAQ[];
  categories: string[];
  userRole: string;
}

interface UseFAQsReturn {
  faqs: FAQ[];
  categories: string[];
  userRole: string;
  loading: boolean;
  error: string | null;
  searchQuery: string;
  selectedCategory: string | null;
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (category: string | null) => void;
  searchFaqs: (query: string) => Promise<void>;
  trackFaqHit: (faqId: number) => Promise<void>;
  refreshFaqs: () => Promise<void>;
}

export function useFAQs(): UseFAQsReturn {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [allFaqs, setAllFaqs] = useState<FAQ[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [userRole, setUserRole] = useState<string>("guest");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const getHeaders = useCallback(() => {
    const token = getAuthToken();
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, []);

  const fetchFaqs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/ai/faqs", {
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch FAQs");
      }

      const data: FAQResponse = await response.json();
      setAllFaqs(data.faqs);
      setFaqs(data.faqs);
      setCategories(data.categories);
      setUserRole(data.userRole);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load FAQs");
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const searchFaqs = useCallback(async (query: string) => {
    if (!query.trim()) {
      setFaqs(allFaqs);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/ai/faqs/search?q=${encodeURIComponent(query)}`, {
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error("Failed to search FAQs");
      }

      const data = await response.json();
      setFaqs(data.faqs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to search FAQs");
    } finally {
      setLoading(false);
    }
  }, [allFaqs, getHeaders]);

  const trackFaqHit = useCallback(async (faqId: number) => {
    try {
      await fetch(`/api/ai/faqs/${faqId}/hit`, {
        method: "POST",
        headers: getHeaders(),
      });
    } catch (err) {
      console.error("Failed to track FAQ hit:", err);
    }
  }, [getHeaders]);

  // Filter by category
  useEffect(() => {
    if (selectedCategory) {
      setFaqs(allFaqs.filter(faq => faq.category === selectedCategory));
    } else if (!searchQuery) {
      setFaqs(allFaqs);
    }
  }, [selectedCategory, allFaqs, searchQuery]);

  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) {
        searchFaqs(searchQuery);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchFaqs]);

  // Initial fetch
  useEffect(() => {
    fetchFaqs();
  }, [fetchFaqs]);

  return {
    faqs,
    categories,
    userRole,
    loading,
    error,
    searchQuery,
    selectedCategory,
    setSearchQuery,
    setSelectedCategory,
    searchFaqs,
    trackFaqHit,
    refreshFaqs: fetchFaqs,
  };
}

// Hook for popular FAQs only (landing page)
export function usePopularFAQs(limit: number = 5) {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPopular = async () => {
      try {
        const token = getAuthToken();
        const response = await fetch(`/api/ai/faqs/popular?limit=${limit}`, {
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        if (response.ok) {
          const data = await response.json();
          setFaqs(data.faqs);
        }
      } catch (err) {
        console.error("Failed to fetch popular FAQs:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchPopular();
  }, [limit]);

  return { faqs, loading };
}
