# Simulation contract

Status: an architectural invariant, set in M01. The simulator has not been
built, and how it will work has not been decided.

## Invariant

The future demo simulator is an **event producer**. It submits events through
the same validated event ingestion interface that every other input uses (see
[architecture.md](architecture.md#single-ingestion-path)). Everything the
audience sees comes from the product processing those events the normal way.

## The simulator must

- use the same ingestion interface as manual entry and integrations
- mark every record it submits as `SYNTHETIC`, and identify itself as the
  producer
- submit only input data: events and recorded-state changes of the kind a
  workshop system would send
- accept being rejected by validation, like any other producer
- leave human steps to humans: during a demo, a person makes every approval,
  correction and validation through the normal review UI

## The simulator must not

- modify frontend state, including diagnosis state
- set evidence classifications
- set operational diagnoses
- set or inject AI conclusions, explanations or proposed actions
- bypass validation
- bypass human approval or answer approval requests automatically
- create `HUMAN_VALIDATED` records
- fake a successful external integration, for example by showing a Telegram
  message as delivered when it was never sent
- label synthetic events as `SUPPLIED` or `INTEGRATION`

## Enforcement by the product

The product enforces this contract. It does not rely on the simulator behaving
correctly.

- The ingestion interface rejects derived values from every producer:
  classifications, diagnoses, AI output and review decisions.
- The ingestion interface accepts `SUPPLIED` records only from the fixture
  loader, `INTEGRATION` records only from authenticated integration adapters,
  and `HUMAN_VALIDATED` records only from the human review flow.
- Analysis, the AI layer, the review flow and presentation have no
  simulator-specific code paths. The only simulator-specific UI allowed is a
  visible label saying that a simulation is running and that its data is
  synthetic.
- Notification delivery status comes from the actual result of the delivery
  attempt.

## Simulation modes left open

Any of these modes can be built later without changing the product:

- manual event injection
- scenario playback
- timed simulation
- a scripted workshop sequence

The choice is deferred.

## Checks once the simulator exists

- With the simulator removed, the product still builds and works with manual
  input.
- Entering a scenario's events manually produces the same deterministic results
  as the simulator did, given the same engine version. AI wording may differ.
- No simulator module is imported by analysis, AI, review or presentation code.

## Prerequisite

The ingestion interface must exist before the simulator is built. It belongs to
the M02/M03 foundation (see [domain-model.md](domain-model.md)).
