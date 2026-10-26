/** A committed action can succeed while a secondary cleanup needs retrying. */
export class ActionFeedback {
  constructor(
    public text: string,
    public error = false,
  ) {}
}
