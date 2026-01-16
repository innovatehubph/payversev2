import { useState, useEffect, useRef } from "react";
import AppLayout from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChevronLeft, Upload, CheckCircle2, AlertCircle, Clock, Camera, FileText, User, RefreshCw, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getAuthToken } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

type DocumentType = "government_id" | "selfie" | "proof_of_address";

interface KycDocument {
  id: number;
  documentType: string;
  status: string;
  adminNote: string | null;
  createdAt: string;
}

interface KycStatus {
  kycStatus: string;
  documents: KycDocument[];
}

const documentTypes: { type: DocumentType; label: string; description: string; icon: any }[] = [
  { 
    type: "government_id", 
    label: "Government ID", 
    description: "Passport, Driver's License, or National ID",
    icon: FileText
  },
  { 
    type: "selfie", 
    label: "Selfie with ID", 
    description: "Take a photo holding your ID next to your face",
    icon: Camera
  },
  { 
    type: "proof_of_address", 
    label: "Proof of Address", 
    description: "Utility bill or bank statement (within 3 months)",
    icon: User
  },
];

export default function KYC() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<KycStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<DocumentType | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<DocumentType | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getAuthHeaders = () => {
    const token = getAuthToken();
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    };
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/kyc/status", { headers: getAuthHeaders() });
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error("Failed to fetch KYC status:", error);
    } finally {
      setLoading(false);
    }
  };

  const getDocumentStatus = (type: DocumentType): KycDocument | undefined => {
    return status?.documents.find(d => d.documentType === type);
  };

  const handleFileSelect = (type: DocumentType) => {
    setSelectedType(type);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedType) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Error", description: "Please select an image file", variant: "destructive" });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Error", description: "File too large. Maximum size is 5MB.", variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPreviewImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!previewImage || !selectedType) return;

    setUploading(selectedType);
    try {
      const response = await fetch("/api/kyc/submit", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          documentType: selectedType,
          documentData: previewImage,
        }),
      });
      const data = await response.json();

      if (response.ok && data.success) {
        toast({ title: "Success", description: "Document submitted for review" });
        setPreviewImage(null);
        setSelectedType(null);
        await fetchStatus();
        try { await refreshUser(); } catch (e) {}
      } else {
        toast({ title: "Error", description: data.message || "Failed to submit document", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to submit document", variant: "destructive" });
    } finally {
      setUploading(null);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const getStatusBadge = (docStatus: string) => {
    switch (docStatus) {
      case "approved":
        return (
          <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded-full">
            <CheckCircle2 className="h-3 w-3" /> Approved
          </span>
        );
      case "rejected":
        return (
          <span className="flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-1 rounded-full">
            <AlertCircle className="h-3 w-3" /> Rejected
          </span>
        );
      case "pending":
        return (
          <span className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
            <Clock className="h-3 w-3" /> Pending
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <AppLayout>
      <header className="mb-6">
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate("/security")}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Back to Security
        </Button>
        <h1 className="text-2xl font-display font-bold">Identity Verification</h1>
        <p className="text-muted-foreground">Verify your identity to unlock higher limits and features.</p>
      </header>

      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={handleFileChange}
        data-testid="input-kyc-file"
      />

      <div className="space-y-6 pb-20">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Verification Status</CardTitle>
                    <CardDescription>Your current verification level</CardDescription>
                  </div>
                  <div className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                    status?.kycStatus === "verified" 
                      ? "bg-green-100 text-green-700" 
                      : status?.kycStatus === "pending"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-gray-100 text-gray-700"
                  }`}>
                    {status?.kycStatus === "verified" 
                      ? "Verified" 
                      : status?.kycStatus === "pending"
                      ? "Under Review"
                      : "Not Verified"}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {status?.kycStatus === "verified" ? (
                  <div className="p-4 rounded-lg bg-green-50 border border-green-200 text-green-800">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="h-5 w-5" />
                      <span className="font-medium">Identity Verified</span>
                    </div>
                    <p className="text-sm text-green-700 mb-2">
                      You have full access to all PayVerse features with higher transaction limits.
                    </p>
                    <p className="text-xs text-green-600">
                      You can update your documents anytime. Note: Updates may require re-verification.
                    </p>
                  </div>
                ) : status?.kycStatus === "pending" ? (
                  <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="h-5 w-5" />
                      <span className="font-medium">Verification In Progress</span>
                    </div>
                    <p className="text-sm text-amber-700">
                      We're reviewing your documents. This usually takes 1-2 business days.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 rounded-lg bg-blue-50 border border-blue-200 text-blue-800">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="h-5 w-5" />
                      <span className="font-medium">Verification Required</span>
                    </div>
                    <p className="text-sm text-blue-700">
                      Submit your documents below to verify your identity and unlock higher limits.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {previewImage && selectedType && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Preview: {documentTypes.find(d => d.type === selectedType)?.label}</CardTitle>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => { setPreviewImage(null); setSelectedType(null); }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <img 
                    src={previewImage} 
                    alt="Preview" 
                    className="w-full max-h-64 object-contain rounded-lg border mb-4"
                  />
                  <div className="flex gap-2">
                    <Button 
                      onClick={handleUpload} 
                      disabled={!!uploading}
                      className="flex-1"
                      data-testid="button-upload-document"
                    >
                      {uploading ? (
                        <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Upload className="h-4 w-4 mr-2" />
                      )}
                      Submit Document
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => { setPreviewImage(null); setSelectedType(null); }}
                      disabled={!!uploading}
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground ml-1">Required Documents</h3>
              
              {documentTypes.map((docType) => {
                const existingDoc = getDocumentStatus(docType.type);
                const Icon = docType.icon;
                
                return (
                  <Card key={docType.type}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className={`h-12 w-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                          existingDoc?.status === "approved" 
                            ? "bg-green-100" 
                            : existingDoc?.status === "pending"
                            ? "bg-amber-100"
                            : existingDoc?.status === "rejected"
                            ? "bg-red-100"
                            : "bg-gray-100"
                        }`}>
                          <Icon className={`h-6 w-6 ${
                            existingDoc?.status === "approved" 
                              ? "text-green-600" 
                              : existingDoc?.status === "pending"
                              ? "text-amber-600"
                              : existingDoc?.status === "rejected"
                              ? "text-red-600"
                              : "text-gray-600"
                          }`} />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <h4 className="font-medium">{docType.label}</h4>
                            {existingDoc && getStatusBadge(existingDoc.status)}
                          </div>
                          <p className="text-sm text-muted-foreground">{docType.description}</p>
                          
                          {existingDoc?.status === "rejected" && existingDoc.adminNote && (
                            <div className="mt-2 p-2 rounded bg-red-50 border border-red-100 text-xs text-red-700">
                              <span className="font-medium">Reason: </span>{existingDoc.adminNote}
                            </div>
                          )}

                          {/* Allow upload/update for all states except pending */}
                          {(!existingDoc || existingDoc.status !== "pending") && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="mt-3"
                              onClick={() => handleFileSelect(docType.type)}
                              disabled={!!uploading}
                              data-testid={`button-upload-${docType.type}`}
                            >
                              <Upload className="h-4 w-4 mr-1" />
                              {existingDoc?.status === "rejected" ? "Resubmit" :
                               existingDoc?.status === "approved" ? "Update" : "Upload"}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Verification Tips</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Make sure all document corners are visible</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Photos should be clear and well-lit</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Documents must be valid and not expired</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>For selfie, hold your ID next to your face</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
