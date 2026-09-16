import React, { useState, useRef } from 'react';
import { Upload, FileText, Settings, Printer, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { SeatingChart } from './components/SeatingChart';
import { ParsedData } from './types';

// 반 포함 여부 확인 헬퍼 함수
const isClassMatch = (classNum: number, input: string) => {
  if (!input.trim()) return true;
  const parts = input.split(',').map(s => s.trim());
  for (const part of parts) {
    if (part.includes('~') || part.includes('-')) {
      const splitChar = part.includes('~') ? '~' : '-';
      const [start, end] = part.split(splitChar).map(n => parseInt(n.trim(), 10));
      if (classNum >= start && classNum <= end) return true;
    } else {
      if (classNum === parseInt(part, 10)) return true;
    }
  }
  return false;
};

// 학생 제외 여부 확인 헬퍼 함수
const isStudentExcluded = (student: any, excludesStr: string, noExclude: boolean) => {
  if (noExclude || !excludesStr.trim()) return false;
  const excludes = excludesStr.split(',').map(s => s.trim());
  
  const g = student.grade;
  const c = student.class.toString().padStart(2, '0');
  const n = student.number.toString().padStart(2, '0');
  const studentId = `${g}${c}${n}`;
  
  return excludes.includes(studentId);
};

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  
  // 상태: 응시인원 및 분반 옵션
  const [isOver36, setIsOver36] = useState<boolean>(false);
  const [examClassroom1, setExamClassroom1] = useState<string>('');
  const [classLimit1, setClassLimit1] = useState<string>('');
  const [examClassroom2, setExamClassroom2] = useState<string>('');
  const [classLimit2, setClassLimit2] = useState<string>('');
  
  // 제외 필요 응시생 학번
  const [excludeIds, setExcludeIds] = useState<string>('');
  const [noExclude, setNoExclude] = useState<boolean>(false);
  
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
      setError('엑셀 파일을 업로드해주세요.');
      return;
    }
    if (!isOver36 && !examClassroom1.trim()) {
      setError('응시교실을 입력해주세요. (예: 2-13)');
      return;
    }
    if (isOver36 && (!examClassroom1.trim() || !examClassroom2.trim() || !classLimit1.trim() || !classLimit2.trim())) {
      setError('분반 설정에 필요한 응시교실과 반 기준을 모두 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 엑셀 파일을 ArrayBuffer로 읽기
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });

      let subject = '과목미상';
      let grade = '0';
      let classGroup = '';
      const students = [];

      // 1. 헤더에서 과목명, 학년, 분반 추출
      // 예: "교과 : 기하 2학년 2-4 C" 또는 "교과:기하 2학년 2-4 C"
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        for (let j = 0; j < rows[i].length; j++) {
          const cell = String(rows[i][j] || '');
          if (cell.includes('교과') && cell.includes('학년')) {
             const match = cell.match(/교과\s*[:\s]*([^\s]+)\s+(\d+)학년\s+.*?\s+([A-Za-z0-9가-힣]+)$/);
             if (match) {
               subject = match[1];
               grade = match[2];
               classGroup = match[3];
             } else {
               const splits = cell.split(/\s+/);
               const subjectIndex = splits.findIndex(s => s.includes('교과'));
               if (subjectIndex !== -1 && splits[subjectIndex+1]) subject = splits[subjectIndex+1].replace(':', '');
               const gradeMatch = cell.match(/(\d+)학년/);
               if (gradeMatch) grade = gradeMatch[1];
               classGroup = splits[splits.length - 1]; 
               if (subject === '' || subject === ':') subject = splits[subjectIndex+2] || '미상';
             }
          }
        }
      }

      // 2. 학생 명단 파싱
      let headerRowIndex = -1;
      let gradeCol = -1, classCol = -1, numCol = -1, nameCol = -1, hakbunCol = -1;
      
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        for (let j = 0; j < row.length; j++) {
          const cell = String(row[j] || '').replace(/\s+/g, '');
          if (cell === '성명' || cell === '이름') nameCol = j;
          if (cell === '학년') gradeCol = j;
          if (cell === '반') classCol = j;
          if (cell === '번호') numCol = j;
          if (cell === '학번') hakbunCol = j;
        }
        if (nameCol !== -1 && (numCol !== -1 || hakbunCol !== -1)) {
          headerRowIndex = i;
          break;
        }
      }

      if (headerRowIndex === -1) {
        throw new Error("엑셀 파일에서 학생 명단 양식(성명, 학번/번호 등)을 찾을 수 없습니다. 나이스 출석부 원본 파일이 맞는지 확인해주세요.");
      }

      for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        const nameRaw = String(row[nameCol] || '').trim();
        if (!nameRaw) continue;

        if (nameRaw.includes('(위탁)')) continue; // 위탁 학생 제외

        let finalName = nameRaw.replace(/\(공동\)/g, '').trim();

        let sGrade = 0, sClass = 0, sNum = 0;

        if (hakbunCol !== -1 && row[hakbunCol]) {
          const hakbun = String(row[hakbunCol]).replace(/\D/g, '');
          if (hakbun.length === 5) {
            sGrade = parseInt(hakbun.substring(0, 1), 10);
            sClass = parseInt(hakbun.substring(1, 3), 10);
            sNum = parseInt(hakbun.substring(3, 5), 10);
          }
        } else if (gradeCol !== -1 && classCol !== -1 && numCol !== -1) {
          sGrade = parseInt(String(row[gradeCol] || '0').replace(/\D/g, ''), 10);
          sClass = parseInt(String(row[classCol] || '0').replace(/\D/g, ''), 10);
          sNum = parseInt(String(row[numCol] || '0').replace(/\D/g, ''), 10);
        }

        if (sGrade > 0 && sClass > 0 && sNum > 0 && finalName) {
           students.push({
             grade: sGrade,
             class: sClass,
             number: sNum,
             name: finalName
           });
        }
      }

      if (students.length === 0) {
        throw new Error("추출된 학생 데이터가 없습니다.");
      }

      const data: ParsedData = {
        subject,
        grade,
        classGroup,
        students
      };
      
      // 체크박스가 해제되어 있는데 총 인원이 37명 이상일 경우 에러 처리
      const validStudents = data.students.filter(s => !isStudentExcluded(s, excludeIds, noExclude));
      if (!isOver36 && validStudents.length > 36) {
        throw new Error('평가 인원이 37명 이상입니다. 추가분반 체크박스를 눌러주시기 바랍니다.');
      }
      
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
          <h1 className="text-xl font-bold tracking-tight">정기시험 자리배치표 생성</h1>
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
            
            {/* 엑셀 업로드 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                나이스 출석부 엑셀 업로드
              </label>
              <div 
                className="border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  accept=".xlsx, .xls, .csv"
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                />
                <Upload className="text-gray-400 mb-3" size={32} />
                {file ? (
                  <p className="text-purple-600 font-medium truncate max-w-[200px]">{file.name}</p>
                ) : (
                  <>
                    <p className="text-gray-600 font-medium">클릭하여 엑셀 파일 선택</p>
                    <p className="text-xs text-gray-400 mt-1">.xlsx, .xls, .csv 형식만 지원합니다</p>
                  </>
                )}
              </div>
              <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
                <p className="text-xs text-gray-500 font-medium mb-1">나이스 출석부 다운로드 방법</p>
                <p className="text-xs text-gray-400 leading-relaxed">
                  [나이스] - [교과담임] - [학적] - [출결관리] - [교과시간별출석부출력] (우측 상단 엑셀 아이콘 클릭)
                </p>
              </div>
            </div>

            {/* 교실 입력 및 실행 */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  평가교실 정보 입력
                </label>
                <div className="flex items-center">
                  <input
                    id="isOver36"
                    type="checkbox"
                    checked={isOver36}
                    onChange={(e) => setIsOver36(e.target.checked)}
                    className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500"
                  />
                  <label htmlFor="isOver36" className="ml-2 text-sm font-medium text-gray-900">
                    평가인원 37명 이상 (추가분반)
                  </label>
                </div>
              </div>
              
              <div className="flex-1 flex flex-col">
                {!isOver36 ? (
                  <div className="relative mb-4">
                    <input
                      type="text"
                      value={examClassroom1}
                      onChange={(e) => setExamClassroom1(e.target.value)}
                      placeholder="예: 2-13"
                      className="block w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 bg-white"
                    />
                  </div>
                ) : (
                  <div className="space-y-3 mb-4">
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <p className="text-sm font-bold text-gray-700 mb-2">추가분반-a</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={examClassroom1}
                          onChange={(e) => setExamClassroom1(e.target.value)}
                          placeholder="예: 2-13"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-purple-500 focus:border-purple-500"
                        />
                        <input
                          type="text"
                          value={classLimit1}
                          onChange={(e) => setClassLimit1(e.target.value)}
                          placeholder="대상 반 (예: 1-5)"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-purple-500 focus:border-purple-500"
                        />
                      </div>
                    </div>
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <p className="text-sm font-bold text-gray-700 mb-2">추가분반-b</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={examClassroom2}
                          onChange={(e) => setExamClassroom2(e.target.value)}
                          placeholder="예: 2-14"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-purple-500 focus:border-purple-500"
                        />
                        <input
                          type="text"
                          value={classLimit2}
                          onChange={(e) => setClassLimit2(e.target.value)}
                          placeholder="대상 반 (예: 6-13)"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-purple-500 focus:border-purple-500"
                        />
                      </div>
                    </div>
                  </div>
                )}
                
                {/* 제외 필요 응시생 학번 입력란 */}
                <div className="mt-2 mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      별도고사실 및 제적 수강생 학번 입력
                    </label>
                    <div className="flex items-center">
                      <input
                        id="noExclude"
                        type="checkbox"
                        checked={noExclude}
                        onChange={(e) => {
                          setNoExclude(e.target.checked);
                          if (e.target.checked) setExcludeIds('');
                        }}
                        className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500"
                      />
                      <label htmlFor="noExclude" className="ml-2 text-sm font-medium text-gray-900">
                        없음
                      </label>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={excludeIds}
                    onChange={(e) => setExcludeIds(e.target.value)}
                    disabled={noExclude}
                    placeholder="예: 20525, 20526"
                    className="block w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 bg-white disabled:bg-gray-100 disabled:text-gray-400"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    여러 명일 경우 쉼표(,)로 구분하여 5자리 학번을 입력하세요.
                  </p>
                </div>
                
                <button
                  onClick={handleProcess}
                  disabled={isLoading}
                  className="w-full mt-auto flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
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
          <section className="print:m-0 print:p-0 bg-gray-100 p-8 rounded-xl overflow-x-auto print:bg-white print:overflow-visible">
            <div className="min-w-[1122px] print:min-w-0">
              {isOver36 ? (
                <>
                  <SeatingChart 
                    students={parsedData.students.filter(s => isClassMatch(s.class, classLimit1) && !isStudentExcluded(s, excludeIds, noExclude))}
                    subject={parsedData.subject}
                    grade={parsedData.grade}
                    classGroup={parsedData.classGroup}
                    examClassroom={examClassroom1}
                  />
                  <div className="break-before-page h-8 print:h-0" />
                  <SeatingChart 
                    students={parsedData.students.filter(s => isClassMatch(s.class, classLimit2) && !isStudentExcluded(s, excludeIds, noExclude))}
                    subject={parsedData.subject}
                    grade={parsedData.grade}
                    classGroup={parsedData.classGroup}
                    examClassroom={examClassroom2}
                  />
                </>
              ) : (
                <SeatingChart 
                  students={parsedData.students.filter(s => !isStudentExcluded(s, excludeIds, noExclude))}
                  subject={parsedData.subject}
                  grade={parsedData.grade}
                  classGroup={parsedData.classGroup}
                  examClassroom={examClassroom1}
                />
              )}
            </div>
          </section>
        )}
        
      </main>
    </div>
  );
}
