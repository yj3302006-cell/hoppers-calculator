import * as React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends (React.Component as any) {
  constructor(props: any) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    const state = (this as any).state;
    const props = (this as any).props;
    if (state.hasError) {
      let errorMessage = "משהו השתבש. אנא נסה שוב מאוחר יותר.";
      
      try {
        if (state.error?.message) {
          try {
            const parsedError = JSON.parse(state.error.message);
            if (parsedError.error && parsedError.error.includes("insufficient permissions")) {
              errorMessage = "אין לך הרשאות מתאימות לביצוע פעולה זו.";
            } else if (parsedError.error) {
              errorMessage = `שגיאת מסד נתונים: ${parsedError.error}`;
            }
          } catch (e) {
            errorMessage = `שגיאה: ${state.error.message}`;
          }
        }
      } catch (e) {
        // Fallback
      }

      return (
        <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-[32px] shadow-xl border border-[#141414]/5 max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="text-red-600 w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold mb-4">אופס! אירעה שגיאה</h2>
            <p className="text-[#141414]/60 mb-8 leading-relaxed">
              {errorMessage}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-[#5A5A40] text-white py-4 rounded-2xl font-bold hover:bg-[#4A4A30] transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-5 h-5" />
              טען מחדש
            </button>
          </div>
        </div>
      );
    }

    return props.children;
  }
}

export default ErrorBoundary;
