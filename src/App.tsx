import React, { useState, useRef } from 'react';
import { Upload, FileText, Settings, Printer, Loader2 } from 'lucide-react';
import { SeatingChart } from './components/SeatingChart';
import { ParsedData } from './types';

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [examClassroom, setExamClassroom] = useState<string>('');
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleProcess = async () => {
    if (!file) {
      setError('PDF 파일을 업로드해주세요.');
      return;
    }
    if (!examClassroom.trim()) {
      setError('응시교실을 입력해주세요. (예: 2-13)');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 파일을 Base64로 변환
      const reader = new FileReader();
      reader.readAsDataURL(file);
      
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]); // 'data:application/pdf;base64,' 부분 제거
        };
        reader.onerror = error => reject(error);
      });

      const pdfBase64 = await base64Promise;

      // API 호출
      const response = await fetch('/api/parse-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64, examClassroom })
      });

      if (!response.ok) {
        let errorMsg = '분석 중 오류가 발생했습니다.';
        try {
          const errorData = await response.json();
          if (errorData.error) errorMsg = errorData.error;
        } catch (e) {
          errorMsg = `서버 오류가 발생했습니다. (상태 코드: ${response.status})`;
        }
        throw new Error(errorMsg);
      }

      const data: ParsedData = await response.json();
      setParsedData(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || '알 수 없는 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrint = () => {
    try {
      window.print();
    } catch (e) {
      alert("미리보기 화면에서는 인쇄가 제한될 수 있습니다. 우측 상단의 '새 탭에서 열기' 버튼을 클릭하여 새 창에서 인쇄해주세요.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      {/* 헤더 (인쇄 시 숨김) */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-2 rounded-lg text-white">
            <FileText size={24} />
          </div>
          <h1 className="text-xl font-bold tracking-tight">정기시험 자리배치표 생성기</h1>
        </div>
        {parsedData && (
          <button 
            onClick={handlePrint}
            className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-md hover:bg-gray-800 transition-colors"
          >
            <Printer size={18} />
            인쇄하기
          </button>
        )}
      </header>

      <main className="p-6 max-w-5xl mx-auto print:p-0 print:max-w-none">
        
        {/* 입력 폼 (인쇄 시 숨김) */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8 print:hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* PDF 업로드 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                나이스 출석부 PDF 업로드
              </label>
              <div 
                className="border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  accept="application/pdf"
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                />
                <Upload className="text-gray-400 mb-3" size={32} />
                {file ? (
                  <p className="text-blue-600 font-medium truncate max-w-[200px]">{file.name}</p>
                ) : (
                  <>
                    <p className="text-gray-600 font-medium">클릭하여 파일 선택</p>
                    <p className="text-xs text-gray-400 mt-1">PDF 형식만 지원합니다</p>
                  </>
                )}
              </div>
            </div>

            {/* 교실 입력 및 실행 */}
            <div className="flex flex-col">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                응시교실 정보
              </label>
              <div className="flex-1 flex flex-col justify-between">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Settings className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={examClassroom}
                    onChange={(e) => setExamClassroom(e.target.value)}
                    placeholder="예: 2-13"
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white"
                  />
                </div>
                
                <button
                  onClick={handleProcess}
                  disabled={isLoading}
                  className="w-full mt-4 flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="animate-spin mr-2" size={18} />
                      분석 및 생성 중...
                    </>
                  ) : (
                    '자리배치표 생성하기'
                  )}
                </button>
              </div>
            </div>
            
          </div>
          
          {error && (
            <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-md border border-red-200">
              {error}
            </div>
          )}
        </section>

        {/* 결과 표시 영역 */}
        {parsedData && (
          <section className="print:m-0 print:p-0 bg-white">
             <SeatingChart 
               students={parsedData.students}
               subject={parsedData.subject}
               grade={parsedData.grade}
               classGroup={parsedData.classGroup}
               examClassroom={examClassroom}
             />
          </section>
        )}
        
      </main>
    </div>
  );
}
