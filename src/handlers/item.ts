/**
 * Example Handler
 *
 * This demonstrates how to create a handler for the API.
 * You can use this as a template for implementing the required endpoints.
 */

import { validateInput } from "../middleware/validation.js";
import { createStorage } from "../storage/index.js";
import { CreateItemRequest } from "../types/item.js";
import { createItemSchema, idSchema } from "../types/validation.js";

const storage = createStorage();

export async function getAllItemsHandler() {
  try {
    const items = await storage.listItems({});
    return {
      statusCode: 200,
      body: items,
    };
  } catch (error) {
    console.error("Error getting all items:", error);
  }
}

export async function getItemHandler(id: string) {
  try {
    const validatedId = validateInput<string>(idSchema, id);
    const item = await storage.getItem(validatedId);

    if (!item) {
      return {
        statusCode: 404,
        body: { error: "Item not found" },
      };
    }

    return {
      statusCode: 200,
      body: item,
    };
  } catch (error) {
    console.error("Error getting item:", error);
    return {
      statusCode: 500,
      body: { error: "Internal server error" },
    };
  }
}

export async function createItemHandler(data: CreateItemRequest) {
  try {
    const validatedData = validateInput<CreateItemRequest>(
      createItemSchema,
      data,
    );
    const item = await storage.createItem(validatedData);

    return {
      statusCode: 201,
      body: item,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid input") {
      return {
        statusCode: 400,
        body: { error: error.message },
      };
    }

    return {
      statusCode: 500,
      body: { error: "Internal server error" },
    };
  }
}

// TODO: Implement other handlers:
// - updateItemHandler
// - listItemsHandler
// - createVersionHandler
// - getAuditTrailHandler
