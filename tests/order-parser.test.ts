import { describe, expect, it } from "vitest";
import { OrderParseError, parseOrderEmail } from "../src/shared/order-parser";

const withEntities = String.raw`You have received an order.\
&#x20;\
&#x20;Order ID: 3999\
&#x20;Date Added: 29/07/2026\
&#x20;Order Status: Pending Delivery\
&#x20;\
&#x20;Products\
&#x20;\
&#x20;2x Short Range RF (nRF24L01+) $8.00\
&#x20;2x 9V battery (   N/A) $7.00\
&#x20;Totals\
&#x20;\
&#x20;Sub-Total: $15.00\
&#x20;Pickup at Sales Stall (Check FAQ): $0.00\
&#x20;Total: $15.00`;

const withComment = String.raw`You have received an order.\
Order ID: 3991\
Date Added: 27/07/2026\
Order Status: Pending Delivery\
Products\
1x Big Motor Driver (   L298N) $8.00\
Totals\
Sub-Total: $8.00\
Total: $8.00\
The comments for your order are:\
Urgent pickup, we arranged to pick it up tmr (tues) 9am outside MCIC`;

const repeatedModel = String.raw`You have received an order.\
Order ID: 3928\
Date Added: 01/07/2026\
Order Status: Pending Delivery\
Products\
2x yellow wheel 65 mm (   N/A) $6.00\
2x Plastic Geared DC Motor (   N/A) $7.00\
1x Bluetooth Module (HC-05) (HC-05) $15.00\
Totals\
Sub-Total: $28.00\
Total: $28.00`;

const enquiryComment = String.raw`You have received an order.\
Order ID: 3946\
Date Added: 04/07/2026\
Order Status: Pending Delivery\
Products\
1x Small Plastic-Geared Servo (   SG90) $6.00\
1x Ultrasonic Sensor (   HC-SR04) $4.00\
Totals\
Sub-Total: $10.00\
Total: $10.00\
The comments for your order are:\
Just checking is the next stall on the 16th of July? If not when is the next date I can pick this up?`;

describe("parseOrderEmail", () => {
  it("parses escaped/entity-heavy order text and treats prices as line totals", () => {
    expect(parseOrderEmail(withEntities)).toEqual({
      id: "3999",
      dateAdded: "2026-07-29",
      sourceStatus: "Pending Delivery",
      comments: null,
      items: [
        { quantity: 2, rawName: "Short Range RF (nRF24L01+)", lineTotalCents: 800 },
        { quantity: 2, rawName: "9V battery ( N/A)", lineTotalCents: 700 },
      ],
    });
  });

  it("captures the optional order comment separately from totals", () => {
    expect(parseOrderEmail(withComment).comments).toBe(
      "Urgent pickup, we arranged to pick it up tmr (tues) 9am outside MCIC",
    );
  });

  it("parses multiple products with repeated model suffixes", () => {
    const order = parseOrderEmail(repeatedModel);
    expect(order.id).toBe("3928");
    expect(order.items).toHaveLength(3);
    expect(order.items[2]).toEqual({
      quantity: 1,
      rawName: "Bluetooth Module (HC-05) (HC-05)",
      lineTotalCents: 1500,
    });
  });

  it("keeps an enquiry as display-only order text", () => {
    expect(parseOrderEmail(enquiryComment).comments).toBe(
      "Just checking is the next stall on the 16th of July? If not when is the next date I can pick this up?",
    );
  });

  it("rejects partial orders rather than guessing", () => {
    expect(() => parseOrderEmail("Order ID: 1\nProducts\nTotals")).toThrow(OrderParseError);
  });
});
