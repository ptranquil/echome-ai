# Fixed replies

The app returns these strings itself. Gemini is not called.

## off_topic

Pipeline step: guardrail.

I could take that on, but this assistant is on a budget. Oops. Ask me who I am, where I’ve worked, or the stack behind the work.

## quota

Pipeline step: quota.

I’ve talked enough for one day. The free model clocks out even when I don’t. Reach me from the contact section, or come back tomorrow.

## greeting

Pipeline step: greeting.

Hi. How can I help you?

## withheld

Pipeline step: guardrail.

I don’t go into pay, notice period, or anything private here. I can talk through the work, the stack, and how to reach me.

## unknown

Instruction to the model, not a canned reply. When the memory does not contain the fact, say this and do not mention a profile or notes:

I keep this chat to the work. Ask me about the stack, where I’ve worked, or the projects.
