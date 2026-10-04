# EV Sensor Data Communication using TDM

A small web simulation of Time Division Multiplexing (TDM). **Sensor data is simulated and the channel is a software model**; no real EV hardware is used. Real EVs mostly use CAN, LIN or Automotive Ethernet.

## Idea
Five EV sensors share one channel. The **MUX** places one reading from each sensor into a fixed slot of a frame (T1 to T5). The slots are sent one at a time, and the **DEMUX** uses the slot ID to rebuild each reading.

| Slot | Sensor |
|---|---|
| T1 | Battery Voltage |
| T2 | Battery Current |
| T3 | Battery Temperature |
| T4 | Motor RPM |
| T5 | State of Charge |

## Files
`index.html` (page), `style.css` (look), `script.js` (MUX, channel, DEMUX and interface).

## Run
Put the three files in one folder and open `index.html` in a browser (internet needed only for the font).

## Use
- **Start / Pause / Resume** runs frames continuously. **Send one frame** sends a single frame.
- **Mode:** Automatic changes readings by itself. Manual lets you type values (checked against their ranges).
- **Simulate lost slots** drops some slots; the DEMUX shows them as *Missing* and the result changes to *Partial data*.
- **Slot time** sets how long each slot takes.

## Key functions in script.js
`multiplex()` builds the frame, `applyChannelLoss()` models errors, `demultiplex()` recovers readings by slot ID, `compareReadings()` decides the result.

## Deploy
Upload the three files to a GitHub repository, then use GitHub Pages (Settings → Pages) or Netlify to get a public link.

## Limitations
Simulated data, software channel, no real EV protocols.
