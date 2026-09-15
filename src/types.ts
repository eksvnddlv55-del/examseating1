export interface Student {
  grade: number;
  class: number;
  number: number;
  name: string;
}

export interface ParsedData {
  subject: string;
  grade: string;
  classGroup: string;
  students: Student[];
}
