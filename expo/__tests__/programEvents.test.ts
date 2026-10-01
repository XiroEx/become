import {
  subscribeProgramUpdates,
  notifyProgramUpdated,
} from "@/lib/programs/programEvents";

describe("programEvents", () => {
  it("notifies subscribers and handles unsubscription", () => {
    const listener1 = jest.fn();
    const listener2 = jest.fn();

    const unsubscribe1 = subscribeProgramUpdates(listener1);
    const unsubscribe2 = subscribeProgramUpdates(listener2);

    notifyProgramUpdated();
    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);

    unsubscribe1();
    notifyProgramUpdated();
    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(2);

    unsubscribe2();
  });
});
