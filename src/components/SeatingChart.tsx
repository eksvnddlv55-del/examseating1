import React from 'react';
import { Student } from '../types';

interface SeatConfig {
  c1: number;
  c2: number;
  c3: number;
  c4: number;
  c5: number;
}

const getSeatConfig = (total: number): SeatConfig => {
  if (total >= 36) return { c1: 7, c2: 8, c3: 7, c4: 7, c5: 7 };
  if (total === 35) return { c1: 7, c2: 7, c3: 7, c4: 7, c5: 7 };
  
  // 34 이하
  const config = { c1: 7, c2: 7, c3: 7, c4: 7, c5: 7 };
  let remainingToRemove = 35 - total;
  
  if (remainingToRemove > 0) { config.c5 -= 1; remainingToRemove--; }
  if (remainingToRemove > 0) { config.c4 -= 1; remainingToRemove--; }
  if (remainingToRemove > 0) { config.c3 -= 1; remainingToRemove--; }
  if (remainingToRemove > 0) { config.c2 -= 1; remainingToRemove--; }
  if (remainingToRemove > 0) { config.c1 -= 1; remainingToRemove--; }
  
  // 만약 30명 미만이라 5명 이상을 빼야 할 경우, 다시 5열부터 뺌
  while(remainingToRemove > 0) {
    if (remainingToRemove > 0) { config.c5 -= 1; remainingToRemove--; }
    if (remainingToRemove > 0) { config.c4 -= 1; remainingToRemove--; }
    if (remainingToRemove > 0) { config.c3 -= 1; remainingToRemove--; }
    if (remainingToRemove > 0) { config.c2 -= 1; remainingToRemove--; }
    if (remainingToRemove > 0) { config.c1 -= 1; remainingToRemove--; }
  }
  
  return config;
};

const formatStudentId = (student: Student) => {
  const g = student.grade;
  const c = student.class.toString().padStart(2, '0');
  const n = student.number.toString().padStart(2, '0');
  return `${g}${c}${n}`;
};

interface SeatingChartProps {
  students: Student[];
  subject: string;
  grade: string;
  classGroup: string;
  examClassroom: string;
}

export const SeatingChart: React.FC<SeatingChartProps> = ({
  students,
  subject,
  grade,
  classGroup,
  examClassroom
}) => {
  const total = students.length;
  const config = getSeatConfig(total);
  const maxRows = Math.max(config.c1, config.c2, config.c3, config.c4, config.c5, 5); 
  
  // 열별 학생 분배
  const cols: (Student | null)[][] = [[], [], [], [], []];
  let studentIndex = 0;
  
  [config.c1, config.c2, config.c3, config.c4, config.c5].forEach((rowCount, colIndex) => {
    for (let i = 0; i < maxRows; i++) {
      if (i < rowCount && studentIndex < total) {
        cols[colIndex].push(students[studentIndex]);
        studentIndex++;
      } else {
        cols[colIndex].push(null);
      }
    }
  });

  return (
    <div className="w-[1122px] mx-auto bg-white p-8 text-black shadow-lg mb-8 print:p-0 print:m-0 print:w-full print:shadow-none print:mb-0">
      <h1 className="text-2xl font-bold text-center mb-6 print:mb-4">
        2026학년도 2학기 1차 정기시험 {subject}({grade}학년) {classGroup}반({examClassroom}) 자리배치표
      </h1>
      
      <div className="border-2 border-black">
        {/* 교탁 영역 (3열과 정확히 일치하도록 너비 및 테두리 조정) */}
        <div className="flex border-b border-black">
          <div className="w-16 border-r border-black shrink-0"></div> {/* 운동장 여백 */}
          <div className="flex-1 grid grid-cols-5">
            <div className="col-span-2 border-r border-black"></div>
            <div className="col-span-1 flex items-center justify-center py-3 print:py-2 font-bold text-xl border-r border-black">
              &nbsp;&nbsp;&nbsp;교탁&nbsp;&nbsp;&nbsp;
            </div>
            <div className="col-span-2"></div>
          </div>
          <div className="w-16 border-l border-black shrink-0"></div> {/* 복도 여백 */}
        </div>
        
        {/* 본문 격자 영역 */}
        <div className="flex min-h-[500px] print:min-h-0">
          {/* 운동장 */}
          <div className="w-16 flex items-center justify-center border-r border-black font-bold text-xl [writing-mode:vertical-rl] tracking-[1.5em]">
            운동장
          </div>
          
          {/* 좌석 */}
          <div className="flex-1 grid grid-cols-5">
            {/* 열 레이블 */}
            <div className="text-center font-bold py-2 border-b border-r border-black bg-gray-50">1열</div>
            <div className="text-center font-bold py-2 border-b border-r border-black bg-gray-50">2열</div>
            <div className="text-center font-bold py-2 border-b border-r border-black bg-gray-50">3열</div>
            <div className="text-center font-bold py-2 border-b border-r border-black bg-gray-50">4열</div>
            <div className="text-center font-bold py-2 border-b border-black bg-gray-50">5열</div>
            
            {/* 셀 렌더링 (행 우선) */}
            {Array.from({ length: maxRows }).map((_, rowIndex) => (
              <React.Fragment key={rowIndex}>
                {[0, 1, 2, 3, 4].map((colIndex) => {
                  const student = cols[colIndex][rowIndex];
                  const isLastCol = colIndex === 4;
                  return (
                    <div 
                      key={`${rowIndex}-${colIndex}`}
                      className={`h-20 print:h-[65px] border-b border-black flex flex-col items-center justify-center p-2 print:p-1 ${isLastCol ? '' : 'border-r'} relative`}
                    >
                      {student ? (
                        <>
                          <div className="font-bold text-lg sm:text-xl">{student.name}</div>
                          <div className="text-gray-600 font-medium text-sm sm:text-base">{formatStudentId(student)}</div>
                        </>
                      ) : (
                        <div className="absolute inset-0 w-full h-full">
                           <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                             <line x1="0" y1="100" x2="100" y2="0" stroke="black" strokeWidth="1" />
                           </svg>
                        </div>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
          
          {/* 복도 */}
          <div className="w-16 flex items-center justify-center border-l border-black font-bold text-xl [writing-mode:vertical-rl] tracking-[1.5em]">
            복도
          </div>
        </div>
      </div>
    </div>
  );
};
