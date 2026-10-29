-- AlterTable
ALTER TABLE "UserPreference" ADD COLUMN     "attendanceLateAs" TEXT NOT NULL DEFAULT 'present',
ADD COLUMN     "attendanceLeaveAs" TEXT NOT NULL DEFAULT 'absent';
