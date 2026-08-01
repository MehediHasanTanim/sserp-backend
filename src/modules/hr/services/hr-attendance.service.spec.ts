import { HrAttendanceService } from './hr-attendance.service';

describe('HrAttendanceService.computePenaltyAmount', () => {
  it('returns 0 when penalty rates are zero', () => {
    expect(
      HrAttendanceService.computePenaltyAmount({
        lateMinutes: 20,
        earlyLeaveMinutes: 10,
        latePenaltyPerMinute: 0,
        earlyLeavePenaltyPerMinute: 0,
      }),
    ).toBe(0);
  });

  it('applies late and early leave rates after grace (minutes already net of grace)', () => {
    expect(
      HrAttendanceService.computePenaltyAmount({
        lateMinutes: 12,
        earlyLeaveMinutes: 5,
        latePenaltyPerMinute: 100,
        earlyLeavePenaltyPerMinute: 50,
      }),
    ).toBe(12 * 100 + 5 * 50);
  });
});
