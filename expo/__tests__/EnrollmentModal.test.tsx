import { fireEvent, render } from "@testing-library/react-native";
import { EnrollmentModal } from "@/components/programs/EnrollmentModal";
import { localDateKey } from "@/lib/time/localDay";
import { suggestStartDate } from "@/lib/programs/enrollment";

describe("EnrollmentModal", () => {
  it("renders when visible with heading, est completion, and buttons", () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();

    const { getByTestId, getByText } = render(
      <EnrollmentModal
        visible={true}
        programName="Lean & Strong"
        durationWeeks={8}
        initialDate="2026-10-05"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    expect(getByText("When do you want to start?")).toBeTruthy();
    expect(getByTestId("enroll-modal-est-completion")).toBeTruthy();
    expect(getByTestId("enroll-modal-confirm")).toBeTruthy();
    expect(getByTestId("enroll-modal-cancel")).toBeTruthy();
  });

  it("updates start date when 'Today' chip is pressed", () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();

    const { getByTestId } = render(
      <EnrollmentModal
        visible={true}
        initialDate="2026-10-12"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    fireEvent.press(getByTestId("enroll-modal-date-picker-today-btn"));
    fireEvent.press(getByTestId("enroll-modal-confirm"));

    const expectedToday = localDateKey(new Date());
    expect(onConfirm).toHaveBeenCalledWith(expectedToday);
  });

  it("updates start date when 'Next Monday' chip is pressed", () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();

    const { getByTestId } = render(
      <EnrollmentModal
        visible={true}
        initialDate="2026-10-01"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    fireEvent.press(getByTestId("enroll-modal-date-picker-next-monday-btn"));
    fireEvent.press(getByTestId("enroll-modal-confirm"));

    const expectedNextMonday = suggestStartDate(null, new Date());
    expect(onConfirm).toHaveBeenCalledWith(expectedNextMonday);
  });

  it("calls onClose when Cancel is pressed", () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();

    const { getByTestId } = render(
      <EnrollmentModal
        visible={true}
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    fireEvent.press(getByTestId("enroll-modal-cancel"));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("disables confirm button and shows loading state", () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();

    const { getByTestId, getByText } = render(
      <EnrollmentModal
        visible={true}
        initialDate="2026-10-05"
        onConfirm={onConfirm}
        onClose={onClose}
        loading={true}
      />,
    );

    expect(getByText("Enrolling...")).toBeTruthy();
    fireEvent.press(getByTestId("enroll-modal-confirm"));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
