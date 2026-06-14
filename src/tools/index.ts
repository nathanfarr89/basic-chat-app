import OpenAi from "openai";

const openAI = new OpenAi();

function getTimeOfDay() {
    return '5:45'
}

function getOrderStatus(orderId: string) {
    console.log('Getting order status for order id: ', orderId);
    const orderAsNumber = parseInt(orderId)
    if (orderAsNumber % 2 === 0) {
        return 'IN_PROGRESS'
    }
    return 'SHIPPED'
}

async function callOpenAIWithTools() {
    const context: OpenAi.Chat.ChatCompletionMessageParam[] = [
        {
            role: 'system',
            content: 'You are a helpful assistant that gives information about the time of day and order status.'
        },
        {
            role: 'user',
            content: 'What is the status of order 12345'
        }
    ]

    const response = await openAI.chat.completions.create({
        model: 'gpt-4o',
        messages: context,
        tools: [
            {
                type: 'function',
                function: {
                    name: 'getTimeOfDay',
                    description: 'Get the current time of day.',
                }
            },
            {
                type: 'function',
                function: {
                    name: 'getOrderStatus',
                    description: 'Resturns the status of an order',
                    parameters: {
                        type: 'object',
                        properties: {
                            orderId: {
                                type: 'string',
                                description: 'The id of the order to get the status of'
                            }
                        },
                        require: ['orderId']
                    }
                }
            }
        ],
        tool_choice: 'auto'
    })
    const willInvokeFunction = response.choices[0].finish_reason === 'tool_calls'
    const toolCall = response.choices[0].message.tool_calls![0]
    if (willInvokeFunction) {
        if (toolCall.type === 'function') {
            const toolName = toolCall.function.name
            if (toolName === 'getTimeOfDay') {
                const toolResponse = getTimeOfDay()
                context.push(response.choices[0].message)
                context.push({
                    role: 'tool',
                    content: toolResponse,
                    tool_call_id: toolCall.id
                })
            }
            if (toolName === 'getOrderStatus') {
                const rawArgument = toolCall.function.arguments;
                const parsedArguments = JSON.parse(rawArgument);
                const toolResponse = getOrderStatus(parsedArguments.orderId)
                context.push(response.choices[0].message)
                context.push({
                    role: 'tool',
                    content: toolResponse,
                    tool_call_id: toolCall.id
                })
            }
        }
    }
    const secondResponse = await openAI.chat.completions.create({
        model: 'gpt-4o',
        messages: context
    })
    console.log(secondResponse.choices[0].message.content);
    
}

callOpenAIWithTools();

