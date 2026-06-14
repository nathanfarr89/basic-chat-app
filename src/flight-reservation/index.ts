import OpenAi from "openai";
import * as readline from 'readline';

const openAI = new OpenAi();

function getAvailableFlights(origin: string, destination: string): string[] {
    // Hard-coded (fake) flight numbers
    return ['12345', '67890'];
}

function makeReservation(flightNumber: string): string {
    // Return a fake confirmation number
    const confirmation = `CONF-${Math.floor(100000 + Math.random() * 900000)}`;
    return confirmation;
}

function question(rl: readline.Interface, q: string): Promise<string> {
    return new Promise((resolve) => rl.question(q, (ans) => resolve(ans.trim())));
}

async function runCLI() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    const origin = (await question(rl, 'Enter origin airport code: ')).toUpperCase();
    const destination = (await question(rl, 'Enter destination airport code: ')).toUpperCase();

    const context: OpenAi.Chat.ChatCompletionMessageParam[] = [
        {
            role: 'system',
            content: 'You are a helpful assistant that finds available flights and reserves flights.'
        },
        {
            role: 'user',
            content: `Find available flights between ${origin} and ${destination}`
        }
    ];

    const initial = await openAI.chat.completions.create({
        model: 'gpt-4o',
        messages: context,
        tools: [
            {
                type: 'function',
                function: {
                    name: 'getAvailableFlights',
                    description: 'Get available flights between the provided origin and destination'
                }
            },
            {
                type: 'function',
                function: {
                    name: 'makeReservation',
                    description: 'Make a reservation for a given flight and return a confirmation number',
                    parameters: {
                        type: 'object',
                        properties: {
                            flightNumber: {
                                type: 'string',
                                description: 'The flight number to reserve'
                            }
                        },
                        required: ['flightNumber']
                    }
                }
            }
        ],
        tool_choice: 'auto'
    });

    const willInvokeFunction = initial.choices[0].finish_reason === 'tool_calls';
    if (!willInvokeFunction) {
        console.log(initial.choices[0].message.content);
        rl.close();
        return;
    }

    const toolCall = initial.choices[0].message.tool_calls![0];
    if (toolCall.type === 'function' && toolCall.function.name === 'getAvailableFlights') {
        // Execute local tool
        const flights = getAvailableFlights(origin, destination);

        // Push assistant message and tool response into context
        context.push(initial.choices[0].message);
        context.push({ role: 'tool', content: `Available flights: ${flights.join(',')}`, tool_call_id: toolCall.id });

        // Show flights to user and prompt selection
        console.log(`\nAvailable flights between ${origin} and ${destination}:`);
        flights.forEach((f, i) => console.log(`${i + 1}) Flight ${f}`));

        const choice = await question(rl, '\nEnter the number of the flight you want (e.g. 1) or the flight number: ');
        let selectedFlight: string | undefined;
        const idx = parseInt(choice, 10);
        if (!isNaN(idx) && idx >= 1 && idx <= flights.length) {
            selectedFlight = flights[idx - 1];
        } else if (flights.includes(choice)) {
            selectedFlight = choice;
        }

        if (!selectedFlight) {
            console.log('Invalid selection. Exiting.');
            rl.close();
            return;
        }

        // Add user's selection to context so the model can decide to call makeReservation
        context.push({ role: 'user', content: `I choose flight ${selectedFlight}` });

        const second = await openAI.chat.completions.create({
            model: 'gpt-4o',
            messages: context,
            tools: [
                {
                    type: 'function',
                    function: {
                        name: 'getAvailableFlights',
                        description: 'Get available flights between the provided origin and destination'
                    }
                },
                {
                    type: 'function',
                    function: {
                        name: 'makeReservation',
                        description: 'Make a reservation for a given flight and return a confirmation number',
                        parameters: {
                            type: 'object',
                            properties: {
                                flightNumber: {
                                    type: 'string',
                                    description: 'The flight number to reserve'
                                }
                            },
                            required: ['flightNumber']
                        }
                    }
                }
            ],
            tool_choice: 'auto'
        });

        const secondWillInvoke = second.choices[0].finish_reason === 'tool_calls';
        if (secondWillInvoke) {
            const toolCall2 = second.choices[0].message.tool_calls![0];
            if (toolCall2.type === 'function' && toolCall2.function.name === 'makeReservation') {
                const rawArgs = toolCall2.function.arguments;
                const parsed = JSON.parse(rawArgs);
                const reservation = makeReservation(parsed.flightNumber || selectedFlight);

                context.push(second.choices[0].message);
                context.push({ role: 'tool', content: reservation, tool_call_id: toolCall2.id });

                const final = await openAI.chat.completions.create({ model: 'gpt-4o', messages: context });
                console.log(final.choices[0].message.content ?? `Reservation confirmed: ${reservation}`);
                rl.close();
                return;
            }
        }

        // If the model didn't call the reservation tool, print its reply
        console.log(second.choices[0].message.content);
        rl.close();
        return;
    }

    // Fallback: print initial assistant content
    console.log(initial.choices[0].message.content);
    rl.close();
}

runCLI().catch((err) => {
    console.error(err);
    process.exit(1);
});

